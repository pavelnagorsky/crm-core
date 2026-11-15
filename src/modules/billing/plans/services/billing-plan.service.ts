import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingPlan,
  BillingPlanPrice,
  BillingPlanPricingMode,
  BillingPlanStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppCacheService } from '../../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../../shared/cache/cache-dependency.js';
import { PrismaErrorCode } from '../../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { countryDefault } from '../../../../shared/geo/country-defaults.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BILLING_PLANS_CACHE } from '../../cache/billing-plans.cache.js';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { BILLING_PLAN_WITH_PRICES_INCLUDE } from '../../constants/billing-plan-select.js';
import { CreateBillingPlanPriceDto } from '../../dto/create-billing-plan-price.dto.js';
import { CreateBillingPlanDto } from '../../dto/create-billing-plan.dto.js';
import { UpdateBillingPlanDto } from '../../dto/update-billing-plan.dto.js';
import { BillingPlanWithPrices } from '../../interfaces/billing-plan-with-prices.interface.js';

/** A price set "now" may arrive a little after the server clock. */
const PAST_TOLERANCE_MS = 60_000;

const SELF_SERVE_WHERE = {
  status: BillingPlanStatus.ACTIVE,
  isPublic: true,
  pricingMode: BillingPlanPricingMode.STANDARD,
} satisfies Prisma.BillingPlanWhereInput;

/** Owns BillingPlan and BillingPlanPrice. Plans are never deleted, prices never edited. */
@Injectable()
export class BillingPlanService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cache: AppCacheService,
  ) {}

  /** Every plan with every price version; current prices are picked on read. */
  findAllCached(): Promise<BillingPlanWithPrices[]> {
    return this.cache.getOrLoad(BILLING_PLANS_CACHE, {}, () => this.findAll());
  }

  findAll(): Promise<BillingPlanWithPrices[]> {
    return this.db.billingPlan.findMany({
      include: BILLING_PLAN_WITH_PRICES_INCLUDE,
      orderBy: [{ position: 'asc' }, { code: 'asc' }],
    });
  }

  async findById(id: string): Promise<BillingPlanWithPrices> {
    const plan = await this.db.billingPlan.findUnique({
      where: { id },
      include: BILLING_PLAN_WITH_PRICES_INCLUDE,
    });
    if (!plan) throw new NotFoundException('Billing plan not found');
    return plan;
  }

  /** From the cache: owner flows read plans on every request. */
  async findByCode(code: string): Promise<BillingPlanWithPrices> {
    const plan = (await this.findAllCached()).find((p) => p.code === code);
    if (!plan) throw new NotFoundException('Billing plan not found');
    return plan;
  }

  async create(
    dto: CreateBillingPlanDto,
    actorId: string,
  ): Promise<BillingPlanWithPrices> {
    try {
      const plan = await this.db.billingPlan.create({
        data: {
          code: dto.code,
          name: dto.name,
          position: dto.position,
          isPublic: dto.isPublic,
          pricingMode: dto.pricingMode,
          staffLimit: dto.staffLimit,
          locationLimit: dto.locationLimit,
          updatedById: actorId,
        },
        include: BILLING_PLAN_WITH_PRICES_INCLUDE,
      });
      await this.invalidate();
      return plan;
    } catch (e) {
      if (
        (e as { code?: string })?.code ===
        PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
      )
        throw new AppException(
          ErrorCode.BILLING_PLAN_CODE_EXISTS,
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }

  async update(
    id: string,
    dto: UpdateBillingPlanDto,
    actorId: string,
  ): Promise<BillingPlanWithPrices> {
    const plan = await this.findById(id);
    if (dto.isPublic === false) await this.assertNotLastSelfServe(plan);
    const updated = await this.db.billingPlan.update({
      where: { id },
      data: {
        name: dto.name,
        position: dto.position,
        isPublic: dto.isPublic,
        staffLimit: dto.staffLimit,
        locationLimit: dto.locationLimit,
        updatedById: actorId,
      },
      include: BILLING_PLAN_WITH_PRICES_INCLUDE,
    });
    await this.invalidate();
    return updated;
  }

  async archive(id: string, actorId: string): Promise<BillingPlanWithPrices> {
    const plan = await this.findById(id);
    await this.assertNotLastSelfServe(plan);
    return this.setStatus(id, BillingPlanStatus.ARCHIVED, actorId);
  }

  async restore(id: string, actorId: string): Promise<BillingPlanWithPrices> {
    await this.findById(id);
    return this.setStatus(id, BillingPlanStatus.ACTIVE, actorId);
  }

  async findPrices(
    planId: string,
    countryCode?: string,
  ): Promise<BillingPlanPrice[]> {
    await this.findById(planId);
    return this.db.billingPlanPrice.findMany({
      where: { planId, countryCode },
      orderBy: [
        { countryCode: 'asc' },
        { billingPeriod: 'asc' },
        { effectiveFrom: 'desc' },
      ],
    });
  }

  async addPrice(
    planId: string,
    dto: CreateBillingPlanPriceDto,
    actorId: string,
    now = new Date(),
  ): Promise<BillingPlanPrice> {
    const plan = await this.findById(planId);
    if (plan.pricingMode !== BillingPlanPricingMode.STANDARD)
      throw new AppException(
        ErrorCode.BILLING_PLAN_NOT_AVAILABLE,
        HttpStatus.CONFLICT,
      );
    const countryCode = dto.countryCode.toUpperCase();
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : now;
    if (effectiveFrom.getTime() < now.getTime() - PAST_TOLERANCE_MS)
      throw new AppException(
        ErrorCode.BILLING_PRICE_EFFECTIVE_FROM_PAST,
        HttpStatus.BAD_REQUEST,
      );
    const amount = MoneyUtils.quantize(dto.amount);
    if (amount.lte(0))
      throw new BadRequestException('amount must be greater than 0');
    const currency = await this.resolveCurrency(countryCode, dto.currency);

    try {
      const price = await this.db.billingPlanPrice.create({
        data: {
          planId,
          countryCode,
          currency,
          billingPeriod: dto.billingPeriod,
          amount,
          effectiveFrom,
          createdById: actorId,
        },
      });
      await this.invalidate();
      return price;
    } catch (e) {
      if (
        (e as { code?: string })?.code ===
        PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
      )
        throw new ConflictException(
          'A price version with this start already exists',
        );
      throw e;
    }
  }

  /** Only a future version can be removed; a version that applied once is history. */
  async deletePrice(
    planId: string,
    priceId: string,
    now = new Date(),
  ): Promise<void> {
    const price = await this.db.billingPlanPrice.findFirst({
      where: { id: priceId, planId },
    });
    if (!price) throw new NotFoundException('Price not found');
    if (price.effectiveFrom <= now)
      throw new AppException(
        ErrorCode.BILLING_PRICE_ALREADY_EFFECTIVE,
        HttpStatus.CONFLICT,
      );
    await this.db.billingPlanPrice.delete({ where: { id: priceId } });
    await this.invalidate();
  }

  /** One currency per country: existing prices first, then the country default. */
  private async resolveCurrency(
    countryCode: string,
    requested: string | undefined,
  ): Promise<string> {
    const existing = await this.db.billingPlanPrice.findFirst({
      where: { countryCode },
      select: { currency: true },
      orderBy: { createdAt: 'desc' },
    });
    const expected =
      existing?.currency ?? countryDefault(countryCode)?.currency ?? null;
    const currency = requested?.toUpperCase() ?? expected;
    if (!currency || (expected && currency !== expected))
      throw new AppException(
        ErrorCode.BILLING_PRICE_CURRENCY_MISMATCH,
        HttpStatus.BAD_REQUEST,
        { countryCode, currency: expected },
      );
    return currency;
  }

  private async assertNotLastSelfServe(plan: BillingPlan): Promise<void> {
    if (!EffectiveLimitsCalculator.isSelfServe(plan)) return;
    const others = await this.db.billingPlan.count({
      where: { ...SELF_SERVE_WHERE, id: { not: plan.id } },
    });
    if (others === 0)
      throw new AppException(
        ErrorCode.BILLING_PLAN_LAST_PUBLIC,
        HttpStatus.CONFLICT,
      );
  }

  private async setStatus(
    id: string,
    status: BillingPlanStatus,
    actorId: string,
  ): Promise<BillingPlanWithPrices> {
    const plan = await this.db.billingPlan.update({
      where: { id },
      data: { status, updatedById: actorId },
      include: BILLING_PLAN_WITH_PRICES_INCLUDE,
    });
    await this.invalidate();
    return plan;
  }

  private invalidate(): Promise<void> {
    return this.cache.invalidate(CacheDependency.billingPlans());
  }
}

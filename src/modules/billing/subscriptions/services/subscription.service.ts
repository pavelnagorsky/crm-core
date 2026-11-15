import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppCacheService } from '../../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../../shared/cache/cache-dependency.js';
import { stableOrderBy } from '../../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { SUBSCRIPTION_WITH_PLAN_INCLUDE } from '../../constants/billing-plan-select.js';
import { PageWindow } from '../../interfaces/page-window.interface.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';

type Tx = Prisma.TransactionClient;

/**
 * Owns the Subscription row: reads, the row lock and the brand cache. Changes
 * live in the other subscription services and all go through withLock or lock.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cache: AppCacheService,
  ) {}

  invalidate(brandId: string): Promise<void> {
    return this.cache.invalidate(CacheDependency.subscription(brandId));
  }

  async invalidateMany(brandIds: Iterable<string>): Promise<void> {
    for (const brandId of new Set(brandIds)) await this.invalidate(brandId);
  }

  // ─── Locking ─────────────────────────────────────────────────────────────

  /** Locks the row for the rest of the transaction; null in FREE. */
  async lock(brandId: string, tx: Tx): Promise<SubscriptionWithPlan | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Subscription" WHERE "brandId" = ${brandId} FOR UPDATE`;
    if (!rows.length) return null;
    return this.findByBrand(brandId, tx);
  }

  async lockOrThrow(brandId: string, tx: Tx): Promise<SubscriptionWithPlan> {
    const subscription = await this.lock(brandId, tx);
    if (!subscription)
      throw new AppException(
        ErrorCode.SUBSCRIPTION_NOT_STARTED,
        HttpStatus.CONFLICT,
      );
    return subscription;
  }

  /** Locks the started subscription, runs the change and resets the brand cache after commit. */
  async withLock<T>(
    brandId: string,
    change: (subscription: SubscriptionWithPlan, tx: Tx) => Promise<T>,
  ): Promise<T> {
    const result = await this.db.$transaction(async (tx) =>
      change(await this.lockOrThrow(brandId, tx), tx),
    );
    await this.invalidate(brandId);
    return result;
  }

  // ─── Reads ───────────────────────────────────────────────────────────────

  findByBrand(
    brandId: string,
    tx: Tx = this.db,
  ): Promise<SubscriptionWithPlan | null> {
    return tx.subscription.findUnique({
      where: { brandId },
      include: SUBSCRIPTION_WITH_PLAN_INCLUDE,
    });
  }

  async findByBrandOrThrow(brandId: string): Promise<SubscriptionWithPlan> {
    const subscription = await this.findByBrand(brandId);
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }

  /** Brand whose subscription spent the trial of this user, deleted ones included. */
  async findTrialBrandId(
    userId: string,
    tx: Tx = this.db,
  ): Promise<string | null> {
    const row = await tx.subscription.findFirst({
      where: { trialUserId: userId },
      select: { brandId: true },
    });
    return row?.brandId ?? null;
  }

  findManyByPlan(planId: string): Promise<SubscriptionWithPlan[]> {
    return this.db.subscription.findMany({
      where: { planId },
      include: SUBSCRIPTION_WITH_PLAN_INCLUDE,
    });
  }

  async countByPlan(): Promise<Map<string, number>> {
    const rows = await this.db.subscription.groupBy({
      by: ['planId'],
      _count: { _all: true },
    });
    return new Map(
      rows
        .filter((r) => r.planId !== null)
        .map((r) => [r.planId as string, r._count._all]),
    );
  }

  async countByCountry(): Promise<Map<string, number>> {
    const rows = await this.db.subscription.groupBy({
      by: ['countryCode'],
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.countryCode, r._count._all]));
  }

  /** Admin list: the where clause is built by the caller from the filters. */
  async search(
    where: Prisma.SubscriptionWhereInput,
    orderBy: Prisma.SubscriptionOrderByWithRelationInput,
    direction: OrderDirection,
    page: PageWindow,
  ): Promise<PaginatedResult<SubscriptionWithPlan>> {
    const [items, totalItems] = await this.db.$transaction([
      this.db.subscription.findMany({
        where,
        include: SUBSCRIPTION_WITH_PLAN_INCLUDE,
        orderBy: stableOrderBy(orderBy, direction),
        skip: page.skip,
        take: page.take,
      }),
      this.db.subscription.count({ where }),
    ]);
    return { items, totalItems };
  }
}

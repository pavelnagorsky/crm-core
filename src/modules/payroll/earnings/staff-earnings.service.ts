import { randomUUID } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Booking,
  PayrollPeriodStatus,
  Prisma,
  StaffEarning,
  StaffEarningSource,
  StaffEarningType,
  StaffShift,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { AUDIT_EVENT } from '../../audit/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { AuditPayload } from '../../audit/interfaces/audit-payload.interface.js';
import { BusinessService } from '../../business/business.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { TimeService } from '../../time/time.service.js';
import { CreateManualEarningDto } from './dto/create-manual-earning.dto.js';
import { RecordProductSaleDto } from './dto/record-product-sale.dto.js';
import { StaffEarningSearchOrderBy, StaffEarningSearchRequestDto } from './dto/staff-earning-search-request.dto.js';
import { EarningCalculatorService } from './earning-calculator.service.js';
import { CompensationPlanWithRates } from '../compensation/interfaces/compensation-plan-with-rates.interface.js';
import { StaffCompensationService } from '../compensation/staff-compensation.service.js';
import { dateOnly, dec, money } from '../utils/money.js';

@Injectable()
export class StaffEarningsService {
  private readonly logger = new Logger(StaffEarningsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly compensation: StaffCompensationService,
    private readonly calculator: EarningCalculatorService,
    private readonly staffService: StaffService,
    private readonly businessService: BusinessService,
    private readonly time: TimeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async recordForCompletedBooking(booking: Booking): Promise<StaffEarning | null> {
    try {
      return await this.createBookingCommission(booking);
    } catch (err) {
      this.logger.error(
        `Failed to record earning for booking ${booking.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }

  async reverseForBooking(booking: Booking, actor?: AuditActor): Promise<StaffEarning | null> {
    try {
      return await this.reverseBookingCommission(booking, actor);
    } catch (err) {
      this.logger.error(
        `Failed to reverse earning for booking ${booking.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }

  async createManual(staffId: string, dto: CreateManualEarningDto, actor: AuditActor): Promise<StaffEarning> {
    const staff = await this.staffService.findById(staffId);
    const { timezone, currency } = await this.businessService.getLocale(staff.businessId);
    const earnedOnStr = dto.earnedOn ?? this.time.zonedDateStr(new Date(), timezone);
    const earnedOn = dateOnly(earnedOnStr);
    await this.assertDateUnlocked(staff.businessId, earnedOn);

    const amount = this.calculator.manualAmount(dto.type, dto.amount);
    const earning = await this.insertEarning({
      businessId: staff.businessId,
      staffId,
      type: dto.type,
      source: StaffEarningSource.MANUAL,
      earnedOn,
      amount,
      currency,
      description: dto.type,
      reason: dto.reason,
      actorId: actor.id ?? null,
      actorName: actor.name,
      idempotencyKey: `manual:${randomUUID()}`,
    });

    this.emitEarningAudit(staff.businessId, staffId, AuditEvent.STAFF_EARNING_ADDED, actor, {
      type: dto.type,
      amount: money(amount),
      reason: dto.reason,
    });
    return earning;
  }

  async recordProductSale(businessId: string, dto: RecordProductSaleDto, actor: AuditActor): Promise<StaffEarning> {
    const staff = await this.staffService.findById(dto.staffId);
    if (staff.businessId !== businessId) throw new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
    const { currency } = await this.businessService.getLocale(businessId);
    const earnedOn = dateOnly(dto.soldOn);
    const plan = await this.compensation.resolveForDate(staff.id, earnedOn);
    if (!plan || plan.productCommissionPercent === null) {
      throw new AppException(ErrorCode.PRODUCT_COMMISSION_NOT_CONFIGURED, HttpStatus.CONFLICT);
    }

    const amount = this.calculator.commission(dto.amount, plan.productCommissionPercent);
    const earning = await this.insertEarning({
      businessId,
      staffId: staff.id,
      type: StaffEarningType.PRODUCT_COMMISSION,
      source: StaffEarningSource.PRODUCT_SALE,
      earnedOn,
      amount,
      currency,
      baseAmount: dec(dto.amount),
      ratePercent: dec(plan.productCommissionPercent),
      description: dto.description ?? 'Product sale',
      actorId: actor.id ?? null,
      actorName: actor.name,
      idempotencyKey: `product:${dto.externalId}:PRODUCT_COMMISSION`,
      compensationPlanId: plan.id,
      externalId: dto.externalId,
    });

    this.emitEarningAudit(businessId, staff.id, AuditEvent.STAFF_EARNING_ADDED, actor, {
      type: StaffEarningType.PRODUCT_COMMISSION,
      amount: money(amount),
      externalId: dto.externalId,
    });
    return earning;
  }

  async materializeHourly(
    businessId: string,
    currency: string,
    shift: StaffShift,
    plan: CompensationPlanWithRates | null,
    tx?: Prisma.TransactionClient,
  ): Promise<StaffEarning | null> {
    if (!plan || plan.hourlyRate === null) return null;

    const hours = this.calculator.hoursFromShift(
      this.time.timeToMinutes(shift.startTime),
      this.time.timeToMinutes(shift.endTime),
    );
    const amount = this.calculator.hourly(hours, plan.hourlyRate);
    return this.insertEarning(
      {
        businessId,
        staffId: shift.staffId,
        type: StaffEarningType.HOURLY,
        source: StaffEarningSource.SHIFT,
        earnedOn: shift.date,
        amount,
        currency,
        rateAmount: dec(plan.hourlyRate),
        quantity: hours,
        description: 'Hourly pay',
        idempotencyKey: `shift:${shift.id}:HOURLY`,
        compensationPlanId: plan.id,
        shiftId: shift.id,
      },
      tx,
    );
  }

  async materializeSalary(
    params: {
      businessId: string;
      staffId: string;
      periodId: string;
      earnedOn: Date;
      currency: string;
      amount: Prisma.Decimal;
      rateAmount: Prisma.Decimal;
      quantity: Prisma.Decimal;
      planId: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<StaffEarning> {
    return this.insertEarning(
      {
        businessId: params.businessId,
        staffId: params.staffId,
        type: StaffEarningType.FIXED_SALARY,
        source: StaffEarningSource.PAYROLL,
        earnedOn: params.earnedOn,
        amount: params.amount,
        currency: params.currency,
        rateAmount: params.rateAmount,
        quantity: params.quantity,
        description: 'Fixed salary',
        idempotencyKey: `salary:${params.periodId}:${params.staffId}`,
        compensationPlanId: params.planId,
      },
      tx,
    );
  }

  async createPeriodCorrection(params: {
    businessId: string;
    staffId: string;
    resultId: string;
    amount: Prisma.Decimal;
    currency: string;
    earnedOn: Date;
    reason: string;
    actor: AuditActor;
  }): Promise<StaffEarning> {
    const earning = await this.insertEarning({
      businessId: params.businessId,
      staffId: params.staffId,
      type: StaffEarningType.CORRECTION,
      source: StaffEarningSource.PAYROLL,
      earnedOn: params.earnedOn,
      amount: params.amount,
      currency: params.currency,
      reason: params.reason,
      actorId: params.actor.id ?? null,
      actorName: params.actor.name,
      description: 'Payroll correction',
      idempotencyKey: `correction:${params.resultId}:${randomUUID()}`,
      correctsPayrollResultId: params.resultId,
    });
    this.emitEarningAudit(params.businessId, params.resultId, AuditEvent.PAYROLL_CORRECTED, params.actor, {
      staffId: params.staffId,
      amount: money(params.amount),
      reason: params.reason,
    }, AuditEntity.PAYROLL);
    return earning;
  }

  async search(businessId: string, dto: StaffEarningSearchRequestDto): Promise<PaginatedResult<StaffEarning>> {
    const where: Prisma.StaffEarningWhereInput = { businessId };
    if (dto.staffId) where.staffId = dto.staffId;
    if (dto.type) where.type = dto.type;
    if (dto.from || dto.to) {
      where.earnedOn = {};
      if (dto.from) where.earnedOn.gte = dateOnly(dto.from);
      if (dto.to) where.earnedOn.lte = dateOnly(dto.to);
    }

    const orderBy: Prisma.StaffEarningOrderByWithRelationInput = {
      [dto.orderBy ?? StaffEarningSearchOrderBy.EARNED_ON]: dto.orderDirection ?? OrderDirection.DESC,
    };

    const findArgs: Prisma.StaffEarningFindManyArgs = { where, orderBy };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.staffEarning.findMany(findArgs),
      this.db.staffEarning.count({ where }),
    ]);
    return { items, totalItems };
  }

  listUnpaidThrough(businessId: string, to: Date, tx?: Prisma.TransactionClient): Promise<StaffEarning[]> {
    return this.store(tx).staffEarning.findMany({
      where: { businessId, earnedOn: { lte: to }, payrollResultId: null },
      orderBy: [{ staffId: 'asc' }, { earnedOn: 'asc' }],
    });
  }

  listByResultIds(resultIds: string[]): Promise<StaffEarning[]> {
    if (resultIds.length === 0) return Promise.resolve([]);
    return this.db.staffEarning.findMany({
      where: { payrollResultId: { in: resultIds } },
      orderBy: { earnedOn: 'asc' },
    });
  }

  async detachPeriodEarnings(periodId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const db = this.store(tx);
    const results = await db.payrollResult.findMany({ where: { periodId }, select: { id: true } });
    const resultIds = results.map((r) => r.id);
    if (resultIds.length === 0) return;
    await db.staffEarning.updateMany({
      where: { payrollResultId: { in: resultIds } },
      data: { payrollResultId: null },
    });
  }

  async deleteDraftPeriodComponents(
    businessId: string,
    periodId: string,
    from: Date,
    to: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.store(tx).staffEarning.deleteMany({
      where: {
        businessId,
        earnedOn: { gte: from, lte: to },
        payrollResultId: null,
        OR: [
          { source: StaffEarningSource.SHIFT, type: StaffEarningType.HOURLY },
          { source: StaffEarningSource.PAYROLL, type: StaffEarningType.FIXED_SALARY, idempotencyKey: { startsWith: `salary:${periodId}:` } },
        ],
      },
    });
  }

  async attachToResult(earningIds: string[], resultId: string, tx?: Prisma.TransactionClient): Promise<void> {
    if (earningIds.length === 0) return;
    await this.store(tx).staffEarning.updateMany({
      where: { id: { in: earningIds } },
      data: { payrollResultId: resultId },
    });
  }

  private async createBookingCommission(booking: Booking): Promise<StaffEarning | null> {
    const { timezone, currency } = await this.businessService.getLocale(booking.businessId);
    const earnedOn = dateOnly(this.time.zonedDateStr(booking.startAt, timezone));
    const plan = await this.compensation.resolveForDate(booking.staffId, earnedOn);
    if (!plan) return null;

    const percent = this.compensation.resolveServicePercent(plan, booking.serviceId);
    if (percent === null) return null;

    const base = booking.customPrice ?? booking.servicePrice;
    const amount = this.calculator.commission(base, percent);

    return this.insertEarning({
      businessId: booking.businessId,
      staffId: booking.staffId,
      type: StaffEarningType.SERVICE_COMMISSION,
      source: StaffEarningSource.BOOKING,
      earnedOn,
      amount,
      currency,
      baseAmount: dec(base),
      ratePercent: dec(percent),
      description: booking.serviceTitle,
      idempotencyKey: `booking:${booking.id}:SERVICE_COMMISSION`,
      compensationPlanId: plan.id,
      bookingId: booking.id,
    });
  }

  private async reverseBookingCommission(booking: Booking, actor?: AuditActor): Promise<StaffEarning | null> {
    const original = await this.db.staffEarning.findFirst({
      where: {
        businessId: booking.businessId,
        idempotencyKey: `booking:${booking.id}:SERVICE_COMMISSION`,
      },
    });
    if (!original) return null;

    const existingReversal = await this.db.staffEarning.findUnique({
      where: { reversesEarningId: original.id },
    });
    if (existingReversal) return existingReversal;

    const reversal = await this.insertEarning({
      businessId: booking.businessId,
      staffId: original.staffId,
      type: StaffEarningType.CORRECTION,
      source: StaffEarningSource.BOOKING,
      earnedOn: original.earnedOn,
      amount: dec(original.amount).negated(),
      currency: original.currency,
      baseAmount: original.baseAmount,
      ratePercent: original.ratePercent,
      description: original.description,
      reason: 'Booking status reversed',
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      idempotencyKey: `booking:${booking.id}:SERVICE_COMMISSION:reversal`,
      compensationPlanId: original.compensationPlanId,
      bookingId: booking.id,
      reversesEarningId: original.id,
    });

    if (actor) {
      this.emitEarningAudit(booking.businessId, original.staffId, AuditEvent.STAFF_EARNING_REVERSED, actor, {
        bookingId: booking.id,
        amount: money(reversal.amount),
      });
    }
    return reversal;
  }

  private async assertDateUnlocked(businessId: string, earnedOn: Date): Promise<void> {
    const locked = await this.db.payrollPeriod.findFirst({
      where: {
        businessId,
        startDate: { lte: earnedOn },
        endDate: { gte: earnedOn },
        status: { in: [PayrollPeriodStatus.APPROVED, PayrollPeriodStatus.PAID] },
      },
      select: { id: true },
    });
    if (locked) throw new AppException(ErrorCode.STAFF_EARNING_DATE_LOCKED, HttpStatus.CONFLICT);
  }

  private store(tx?: Prisma.TransactionClient) {
    return tx ?? this.db;
  }

  private async insertEarning(
    data: Prisma.StaffEarningUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<StaffEarning> {
    const db = this.store(tx);
    try {
      return await db.staffEarning.create({ data });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        const existing = await db.staffEarning.findUnique({
          where: {
            businessId_idempotencyKey: {
              businessId: data.businessId,
              idempotencyKey: data.idempotencyKey,
            },
          },
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  private emitEarningAudit(
    businessId: string,
    entityId: string,
    eventType: AuditEvent,
    actor: AuditActor,
    payload: AuditPayload,
    entityType: AuditEntity = AuditEntity.STAFF,
  ): void {
    const event: AuditLogEvent = {
      businessId,
      entityType,
      entityId,
      eventType,
      actionType: eventType === AuditEvent.STAFF_EARNING_REVERSED ? AuditActionType.MODIFY : AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload,
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}

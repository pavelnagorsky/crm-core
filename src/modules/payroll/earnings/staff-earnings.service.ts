import { randomUUID } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  StaffEarning,
  StaffEarningSource,
  StaffEarningType,
  StaffShift,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
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
import { LocationService } from '../../location/location.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { TimeService } from '../../../shared/time/time.service.js';
import { CreateManualEarningDto } from './dto/create-manual-earning.dto.js';
import { RecordProductSaleDto } from './dto/record-product-sale.dto.js';
import { PayrollPeriodEarningsRequestDto } from './dto/payroll-period-earnings-request.dto.js';
import {
  StaffEarningSearchOrderBy,
  StaffEarningSearchRequestDto,
} from './dto/staff-earning-search-request.dto.js';
import { EarningCalculatorService } from './earning-calculator.service.js';
import { CompensationPlanWithRates } from '../compensation/interfaces/compensation-plan-with-rates.interface.js';
import { StaffCompensationService } from '../compensation/staff-compensation.service.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { lockedPeriodWhere } from '../periods/locked-period.js';
import { BookingWithItems } from '../../bookings/interfaces/booking-with-items.interface.js';

@Injectable()
export class StaffEarningsService {
  private readonly logger = new Logger(StaffEarningsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly compensation: StaffCompensationService,
    private readonly calculator: EarningCalculatorService,
    private readonly staffService: StaffService,
    private readonly locationService: LocationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async recordForCompletedBooking(
    booking: BookingWithItems,
  ): Promise<StaffEarning[]> {
    try {
      return await this.createBookingCommission(booking);
    } catch (err) {
      this.logger.error(
        `Failed to record earning for booking ${booking.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      return [];
    }
  }

  async reverseForBooking(
    booking: BookingWithItems,
    reason: string | null,
    actor?: AuditActor,
  ): Promise<StaffEarning[]> {
    try {
      return await this.reverseBookingCommission(booking, reason, actor);
    } catch (err) {
      this.logger.error(
        `Failed to reverse earning for booking ${booking.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      return [];
    }
  }

  async createManual(
    locationId: string,
    staffId: string,
    dto: CreateManualEarningDto,
    actor: AuditActor,
  ): Promise<StaffEarning> {
    const staff = await this.staffService.findById(staffId);
    if (staff.locationId !== locationId)
      throw new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
    const { timezone, currency } = await this.locationService.getLocale(
      locationId,
    );
    const earnedOnStr =
      dto.earnedOn ?? TimeService.zonedDateStr(new Date(), timezone);
    const earnedOn = TimeService.dateOnly(earnedOnStr);
    await this.assertDateUnlocked(locationId, earnedOn);

    const amount = this.calculator.manualAmount(dto.type, dto.amount);
    const earning = await this.insertEarning({
      locationId,
      staffId,
      type: dto.type,
      source: StaffEarningSource.MANUAL,
      earnedOn,
      amount,
      currency,
      reason: dto.reason,
      actorId: actor.id ?? null,
      actorName: actor.name,
      idempotencyKey: this.idempotencyKey({ kind: 'manual' }),
    });

    this.emitEarningAudit(
      locationId,
      staffId,
      AuditEvent.STAFF_EARNING_ADDED,
      actor,
      {
        type: dto.type,
        amount: MoneyService.format(amount),
        currency,
        reason: dto.reason,
      },
    );
    return earning;
  }

  async recordProductSale(
    locationId: string,
    dto: RecordProductSaleDto,
    actor: AuditActor,
  ): Promise<StaffEarning> {
    const staff = await this.staffService.findById(dto.staffId);
    if (staff.locationId !== locationId)
      throw new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
    const { currency } = await this.locationService.getLocale(locationId);
    const earnedOn = TimeService.dateOnly(dto.soldOn);
    const plan = await this.compensation.resolveForDate(staff.id, earnedOn);
    if (!plan || plan.productCommissionPercent === null) {
      throw new AppException(
        ErrorCode.PRODUCT_COMMISSION_NOT_CONFIGURED,
        HttpStatus.CONFLICT,
      );
    }

    const amount = this.calculator.commission(
      dto.amount,
      plan.productCommissionPercent,
    );
    const earning = await this.insertEarning({
      locationId,
      staffId: staff.id,
      type: StaffEarningType.PRODUCT_COMMISSION,
      source: StaffEarningSource.PRODUCT_SALE,
      earnedOn,
      amount,
      currency,
      baseAmount: MoneyService.decimal(dto.amount),
      ratePercent: MoneyService.decimal(plan.productCommissionPercent),
      description: dto.description,
      actorId: actor.id ?? null,
      actorName: actor.name,
      idempotencyKey: this.idempotencyKey({
        kind: 'product',
        externalId: dto.externalId,
      }),
      compensationPlanId: plan.id,
      externalId: dto.externalId,
    });

    this.emitEarningAudit(
      locationId,
      staff.id,
      AuditEvent.STAFF_EARNING_ADDED,
      actor,
      {
        type: StaffEarningType.PRODUCT_COMMISSION,
        amount: MoneyService.format(amount),
        currency,
        externalId: dto.externalId,
      },
    );
    return earning;
  }

  async materializeHourly(
    locationId: string,
    currency: string,
    shift: StaffShift,
    plan: CompensationPlanWithRates | null,
    tx?: Prisma.TransactionClient,
  ): Promise<StaffEarning | null> {
    if (!plan || plan.hourlyRate === null) return null;

    const hours = this.calculator.hoursFromShift(
      TimeService.timeToMinutes(shift.startTime),
      TimeService.timeToMinutes(shift.endTime),
    );
    const amount = this.calculator.hourly(hours, plan.hourlyRate);
    return this.insertEarning(
      {
        locationId,
        staffId: shift.staffId,
        type: StaffEarningType.HOURLY,
        source: StaffEarningSource.SHIFT,
        earnedOn: shift.date,
        amount,
        currency,
        rateAmount: MoneyService.decimal(plan.hourlyRate),
        quantity: MoneyService.quantize(hours),
        idempotencyKey: this.idempotencyKey({
          kind: 'shift',
          shiftId: shift.id,
        }),
        compensationPlanId: plan.id,
        shiftId: shift.id,
      },
      tx,
    );
  }

  async materializeSalary(
    params: {
      locationId: string;
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
        locationId: params.locationId,
        staffId: params.staffId,
        type: StaffEarningType.FIXED_SALARY,
        source: StaffEarningSource.PAYROLL,
        earnedOn: params.earnedOn,
        amount: params.amount,
        currency: params.currency,
        rateAmount: params.rateAmount,
        quantity: params.quantity,
        idempotencyKey: this.idempotencyKey({
          kind: 'salary',
          periodId: params.periodId,
          staffId: params.staffId,
        }),
        compensationPlanId: params.planId,
      },
      tx,
    );
  }

  async createPeriodCorrection(params: {
    locationId: string;
    staffId: string;
    resultId: string;
    amount: Prisma.Decimal;
    currency: string;
    earnedOn: Date;
    reason: string;
    actor: AuditActor;
  }): Promise<StaffEarning> {
    const earning = await this.insertEarning({
      locationId: params.locationId,
      staffId: params.staffId,
      type: StaffEarningType.CORRECTION,
      source: StaffEarningSource.PAYROLL,
      earnedOn: params.earnedOn,
      amount: params.amount,
      currency: params.currency,
      reason: params.reason,
      actorId: params.actor.id ?? null,
      actorName: params.actor.name,
      idempotencyKey: this.idempotencyKey({
        kind: 'correction',
        resultId: params.resultId,
      }),
      correctsPayrollResultId: params.resultId,
    });
    this.emitEarningAudit(
      params.locationId,
      params.resultId,
      AuditEvent.PAYROLL_CORRECTED,
      params.actor,
      {
        staffId: params.staffId,
        type: StaffEarningType.CORRECTION,
        amount: MoneyService.format(params.amount),
        currency: params.currency,
        reason: params.reason,
      },
      AuditEntity.PAYROLL,
    );
    return earning;
  }

  async search(
    locationId: string,
    dto: StaffEarningSearchRequestDto,
  ): Promise<PaginatedResult<StaffEarning>> {
    const where: Prisma.StaffEarningWhereInput = { locationId };
    if (dto.staffId) where.staffId = dto.staffId;
    if (dto.type) where.type = dto.type;
    if (dto.from || dto.to) {
      where.earnedOn = {};
      if (dto.from) where.earnedOn.gte = TimeService.dateOnly(dto.from);
      if (dto.to) where.earnedOn.lte = TimeService.dateOnly(dto.to);
    }

    const findArgs: Prisma.StaffEarningFindManyArgs = {
      where,
      orderBy: this.earningOrder(dto),
    };
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

  async searchByPeriod(
    periodId: string,
    dto: PayrollPeriodEarningsRequestDto,
  ): Promise<PaginatedResult<StaffEarning>> {
    const where: Prisma.StaffEarningWhereInput = {
      payrollResult: { periodId },
    };
    if (dto.staffId) where.staffId = dto.staffId;
    if (dto.type) where.type = dto.type;

    const orderBy = this.earningOrder(dto);

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

  private earningOrder(
    dto: Pick<PayrollPeriodEarningsRequestDto, 'orderBy' | 'orderDirection'>,
  ): Prisma.StaffEarningOrderByWithRelationInput[] {
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    return stableOrderBy(
      { [dto.orderBy ?? StaffEarningSearchOrderBy.EARNED_ON]: direction },
      direction,
    );
  }

  listUnpaidThrough(
    locationId: string,
    to: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<StaffEarning[]> {
    return this.store(tx).staffEarning.findMany({
      where: { locationId, earnedOn: { lte: to }, payrollResultId: null },
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

  async detachPeriodEarnings(
    periodId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = this.store(tx);
    const results = await db.payrollResult.findMany({
      where: { periodId },
      select: { id: true },
    });
    const resultIds = results.map((r) => r.id);
    if (resultIds.length === 0) return;
    await db.staffEarning.updateMany({
      where: { payrollResultId: { in: resultIds } },
      data: { payrollResultId: null },
    });
  }

  async deleteDraftPeriodComponents(
    locationId: string,
    periodId: string,
    from: Date,
    to: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.store(tx).staffEarning.deleteMany({
      where: {
        locationId,
        earnedOn: { gte: from, lte: to },
        payrollResultId: null,
        OR: [
          { source: StaffEarningSource.SHIFT, type: StaffEarningType.HOURLY },
          {
            source: StaffEarningSource.PAYROLL,
            type: StaffEarningType.FIXED_SALARY,
            idempotencyKey: {
              startsWith: this.idempotencyKey({
                kind: 'salaryPeriod',
                periodId,
              }),
            },
          },
        ],
      },
    });
  }

  async attachToResult(
    earningIds: string[],
    resultId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (earningIds.length === 0) return;
    await this.store(tx).staffEarning.updateMany({
      where: { id: { in: earningIds } },
      data: { payrollResultId: resultId },
    });
  }

  private async createBookingCommission(
    booking: BookingWithItems,
  ): Promise<StaffEarning[]> {
    const { timezone, currency } = await this.locationService.getLocale(
      booking.locationId,
    );
    const earnedOn = TimeService.dateOnly(
      TimeService.zonedDateStr(booking.startAt, timezone),
    );
    const earnings: StaffEarning[] = [];
    for (const item of booking.items) {
      const plan = await this.compensation.resolveForDate(
        item.staffId,
        earnedOn,
      );
      if (!plan) continue;
      const percent = this.compensation.resolveServicePercent(
        plan,
        item.serviceId,
      );
      if (percent === null) continue;
      const base = item.customPrice ?? item.chargedPrice;
      const amount = this.calculator.commission(base, percent);
      earnings.push(
        await this.insertEarning({
          locationId: booking.locationId,
          staffId: item.staffId,
          type: StaffEarningType.SERVICE_COMMISSION,
          source: StaffEarningSource.BOOKING,
          earnedOn,
          amount,
          currency,
          baseAmount: MoneyService.decimal(base),
          ratePercent: MoneyService.decimal(percent),
          description: item.serviceTitle,
          idempotencyKey: this.idempotencyKey({
            kind: 'bookingItem',
            bookingItemId: item.id,
          }),
          compensationPlanId: plan.id,
          bookingId: booking.id,
          bookingItemId: item.id,
        }),
      );
    }
    return earnings;
  }

  private async reverseBookingCommission(
    booking: BookingWithItems,
    reason: string | null,
    actor?: AuditActor,
  ): Promise<StaffEarning[]> {
    const itemIds = booking.items.map((item) => item.id);
    const originals = await this.db.staffEarning.findMany({
      where: {
        locationId: booking.locationId,
        bookingItemId: { in: itemIds },
        type: StaffEarningType.SERVICE_COMMISSION,
        source: StaffEarningSource.BOOKING,
      },
    });
    const reversals: StaffEarning[] = [];
    for (const original of originals) {
      const existingReversal = await this.db.staffEarning.findUnique({
        where: { reversesEarningId: original.id },
      });
      if (existingReversal) {
        reversals.push(existingReversal);
        continue;
      }
      const reversal = await this.insertEarning({
        locationId: booking.locationId,
        staffId: original.staffId,
        type: StaffEarningType.CORRECTION,
        source: StaffEarningSource.BOOKING,
        earnedOn: original.earnedOn,
        amount: MoneyService.decimal(original.amount).negated(),
        currency: original.currency,
        baseAmount: original.baseAmount,
        ratePercent: original.ratePercent,
        description: original.description,
        reason,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        idempotencyKey: this.idempotencyKey({
          kind: 'bookingItemReversal',
          bookingItemId: original.bookingItemId ?? original.id,
        }),
        compensationPlanId: original.compensationPlanId,
        bookingId: booking.id,
        bookingItemId: original.bookingItemId,
        reversesEarningId: original.id,
      });
      reversals.push(reversal);

      if (actor) {
        this.emitEarningAudit(
          booking.locationId,
          original.staffId,
          AuditEvent.STAFF_EARNING_REVERSED,
          actor,
          {
            bookingId: booking.id,
            bookingItemId: original.bookingItemId,
            amount: MoneyService.format(reversal.amount),
            currency: original.currency,
          },
        );
      }
    }
    return reversals;
  }

  private async assertDateUnlocked(
    locationId: string,
    earnedOn: Date,
  ): Promise<void> {
    const locked = await this.db.payrollPeriod.findFirst({
      where: lockedPeriodWhere(locationId, earnedOn),
      select: { id: true },
    });
    if (locked)
      throw new AppException(
        ErrorCode.STAFF_EARNING_DATE_LOCKED,
        HttpStatus.CONFLICT,
      );
  }

  private store(tx?: Prisma.TransactionClient) {
    return tx ?? this.db;
  }

  private idempotencyKey(
    input:
      | { kind: 'manual' }
      | { kind: 'product'; externalId: string }
      | { kind: 'shift'; shiftId: string }
      | { kind: 'salary'; periodId: string; staffId: string }
      | { kind: 'salaryPeriod'; periodId: string }
      | { kind: 'correction'; resultId: string }
      | { kind: 'bookingItem'; bookingItemId: string }
      | { kind: 'bookingItemReversal'; bookingItemId: string },
  ): string {
    switch (input.kind) {
      case 'manual':
        return `manual:${randomUUID()}`;
      case 'product':
        return `product:${input.externalId}:${StaffEarningType.PRODUCT_COMMISSION}`;
      case 'shift':
        return `shift:${input.shiftId}:${StaffEarningType.HOURLY}`;
      case 'salary':
        return `salary:${input.periodId}:${input.staffId}`;
      case 'salaryPeriod':
        return `salary:${input.periodId}:`;
      case 'correction':
        return `correction:${input.resultId}:${randomUUID()}`;
      case 'bookingItem':
        return `booking-item:${input.bookingItemId}:${StaffEarningType.SERVICE_COMMISSION}`;
      case 'bookingItemReversal':
        return `booking-item:${input.bookingItemId}:${StaffEarningType.SERVICE_COMMISSION}:reversal`;
    }
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
            locationId_idempotencyKey: {
              locationId: data.locationId,
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
    locationId: string,
    entityId: string,
    eventType: AuditEvent,
    actor: AuditActor,
    payload: AuditPayload,
    entityType: AuditEntity = AuditEntity.STAFF,
  ): void {
    const event: AuditLogEvent = {
      locationId,
      entityType,
      entityId,
      eventType,
      actionType:
        eventType === AuditEvent.STAFF_EARNING_REVERSED
          ? AuditActionType.MODIFY
          : AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload,
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}

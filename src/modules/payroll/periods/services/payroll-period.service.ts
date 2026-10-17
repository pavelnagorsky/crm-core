import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PayrollPeriod,
  PayrollPeriodStatus,
  PayrollResult,
  Prisma,
  Staff,
  StaffEarning,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { stableOrderBy } from '../../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
import { AuditPayload } from '../../../audit/interfaces/audit-payload.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { StaffEarningsService } from '../../earnings/services/staff-earnings.service.js';
import { CreatePayrollCorrectionDto } from '../dto/create-payroll-correction.dto.js';
import { CreatePayrollPeriodDto } from '../dto/create-payroll-period.dto.js';
import { PayrollPeriodSearchRequestDto } from '../dto/payroll-period-search-request.dto.js';
import { PayrollPeriodSearchOrderBy } from '../enums/payroll-period-search-order-by.enum.js';
import { PayrollPeriodWithResults } from '../interfaces/payroll-period-with-results.interface.js';
import { lockedPeriodWhere } from '../utils/locked-period.js';
import { PayrollCalculationService } from './payroll-calculation.service.js';
import { PayrollPeriodLockService } from './payroll-period-lock.service.js';

const EDITABLE_STATUSES: PayrollPeriodStatus[] = [
  PayrollPeriodStatus.DRAFT,
  PayrollPeriodStatus.CALCULATED,
];

@Injectable()
export class PayrollPeriodService {
  constructor(
    private readonly db: DatabaseService,
    private readonly earnings: StaffEarningsService,
    private readonly locationService: LocationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly calculations: PayrollCalculationService,
    private readonly locks: PayrollPeriodLockService,
  ) {}

  async create(
    locationId: string,
    dto: CreatePayrollPeriodDto,
    actor: AuditActor,
  ): Promise<PayrollPeriod> {
    const startDate = TimeUtils.dateOnly(dto.startDate),
      endDate = TimeUtils.dateOnly(dto.endDate);
    if (endDate < startDate)
      throw new AppException(
        ErrorCode.PAYROLL_PERIOD_DATES_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    const { currency } = await this.locationService.getLocale(locationId);
    const period = await this.db.$transaction(async (tx) => {
      await this.locks.lockLocation(locationId, tx);
      const overlap = await tx.payrollPeriod.findFirst({
        where: {
          locationId,
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      });
      if (overlap)
        throw new AppException(
          ErrorCode.PAYROLL_PERIOD_OVERLAP,
          HttpStatus.CONFLICT,
        );
      return tx.payrollPeriod.create({
        data: {
          locationId,
          name: dto.name ?? null,
          startDate,
          endDate,
          currency,
        },
      });
    });
    this.emitPayrollAudit(
      locationId,
      period.id,
      AuditEvent.PAYROLL_PERIOD_CREATED,
      AuditActionType.CREATE,
      actor,
      { startDate: dto.startDate, endDate: dto.endDate },
    );
    return period;
  }

  async search(
    locationId: string,
    dto: PayrollPeriodSearchRequestDto,
  ): Promise<PaginatedResult<PayrollPeriodWithResults>> {
    const where: Prisma.PayrollPeriodWhereInput = { locationId };
    if (dto.status) where.status = dto.status;

    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy: Prisma.PayrollPeriodOrderByWithRelationInput = {
      [dto.orderBy ?? PayrollPeriodSearchOrderBy.START_DATE]: direction,
    };

    const findArgs = {
      where,
      orderBy: stableOrderBy(orderBy, direction),
      include: { results: { orderBy: { staffName: 'asc' as const } } },
      ...(!dto.isExport
        ? { skip: (dto.page - 1) * dto.pageSize, take: dto.pageSize }
        : {}),
    };

    const [items, totalItems] = await this.db.$transaction([
      this.db.payrollPeriod.findMany(findArgs),
      this.db.payrollPeriod.count({ where }),
    ]);
    return { items, totalItems };
  }

  async getStatusCounts(
    locationId: string,
  ): Promise<{ status: PayrollPeriodStatus; count: number }[]> {
    const rows = await this.db.payrollPeriod.groupBy({
      by: ['status'],
      where: { locationId },
      _count: { _all: true },
    });
    return rows.map((r) => ({ status: r.status, count: r._count._all }));
  }

  /** Date ranges where a new earning is rejected. Same filter as `assertDateUnlocked`. */
  async listLockedRanges(
    locationId: string,
  ): Promise<{ startDate: Date; endDate: Date }[]> {
    return this.db.payrollPeriod.findMany({
      where: lockedPeriodWhere(locationId),
      select: { startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
  }

  async findById(periodId: string): Promise<PayrollPeriodWithResults> {
    const period = await this.db.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { results: { orderBy: { staffName: 'asc' } } },
    });
    if (!period)
      throw new AppException(
        ErrorCode.PAYROLL_PERIOD_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return period;
  }

  async delete(periodId: string, actor: AuditActor): Promise<void> {
    const period = await this.findById(periodId);
    if (!EDITABLE_STATUSES.includes(period.status)) {
      throw new AppException(
        ErrorCode.PAYROLL_PERIOD_INVALID_STATUS,
        HttpStatus.CONFLICT,
      );
    }
    await this.db.$transaction(async (tx) => {
      await this.locks.lockUnchangedPeriod(period, tx);
      await this.earnings.detachPeriodEarnings(periodId, tx);
      await this.earnings.deleteDraftPeriodComponents(
        period.locationId,
        periodId,
        period.startDate,
        period.endDate,
        tx,
      );
      await tx.payrollPeriod.delete({ where: { id: periodId } });
    });
    this.emitPayrollAudit(
      period.locationId,
      periodId,
      AuditEvent.PAYROLL_PERIOD_DELETED,
      AuditActionType.DELETE,
      actor,
      {},
    );
  }

  async calculate(
    periodId: string,
    actor: AuditActor,
  ): Promise<PayrollPeriodWithResults> {
    const period = await this.findById(periodId);
    if (!EDITABLE_STATUSES.includes(period.status))
      throw new AppException(
        ErrorCode.PAYROLL_PERIOD_INVALID_STATUS,
        HttpStatus.CONFLICT,
      );
    const updated = await this.calculations.calculate(period);
    this.emitPayrollAudit(
      period.locationId,
      periodId,
      AuditEvent.PAYROLL_CALCULATED,
      AuditActionType.ACTION,
      actor,
      { staffCount: updated.results.length },
    );
    return updated;
  }

  async approve(periodId: string, actor: AuditActor): Promise<PayrollPeriod> {
    const period = await this.findById(periodId);
    if (period.status !== PayrollPeriodStatus.CALCULATED) {
      throw new AppException(
        ErrorCode.PAYROLL_PERIOD_INVALID_STATUS,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.db.$transaction(async (tx) => {
      await this.locks.lockUnchangedPeriod(period, tx);
      return tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: PayrollPeriodStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: actor.id ?? null,
          approvedByName: actor.name,
        },
      });
    });
    this.emitPayrollAudit(
      period.locationId,
      periodId,
      AuditEvent.PAYROLL_APPROVED,
      AuditActionType.ACTION,
      actor,
      {},
    );
    return updated;
  }

  async pay(periodId: string, actor: AuditActor): Promise<PayrollPeriod> {
    const period = await this.findById(periodId);
    if (period.status !== PayrollPeriodStatus.APPROVED) {
      throw new AppException(
        ErrorCode.PAYROLL_PERIOD_INVALID_STATUS,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.db.$transaction(async (tx) => {
      await this.locks.lockUnchangedPeriod(period, tx);
      return tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: PayrollPeriodStatus.PAID,
          paidAt: new Date(),
          paidById: actor.id ?? null,
          paidByName: actor.name,
        },
      });
    });
    this.emitPayrollAudit(
      period.locationId,
      periodId,
      AuditEvent.PAYROLL_PAID,
      AuditActionType.ACTION,
      actor,
      {},
    );
    return updated;
  }

  async correct(
    resultId: string,
    dto: CreatePayrollCorrectionDto,
    actor: AuditActor,
  ): Promise<StaffEarning> {
    const result = await this.db.payrollResult.findUnique({
      where: { id: resultId },
      include: { period: true },
    });
    if (!result)
      throw new AppException(
        ErrorCode.PAYROLL_RESULT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (
      result.period.status !== PayrollPeriodStatus.APPROVED &&
      result.period.status !== PayrollPeriodStatus.PAID
    ) {
      throw new AppException(
        ErrorCode.PAYROLL_CORRECTION_NOT_ALLOWED,
        HttpStatus.CONFLICT,
      );
    }

    const amount = MoneyUtils.decimal(dto.amount);
    if (amount.isZero())
      throw new AppException(
        ErrorCode.STAFF_EARNING_AMOUNT_INVALID,
        HttpStatus.BAD_REQUEST,
      );

    const { timezone } = await this.locationService.getLocale(
      result.locationId,
    );
    const today = TimeUtils.zonedDateStr(new Date(), timezone);
    const afterPeriod = TimeUtils.addDaysStr(
      TimeUtils.dateOnlyStr(result.period.endDate),
      1,
    );
    const earnedOn =
      today > TimeUtils.dateOnlyStr(result.period.endDate)
        ? TimeUtils.dateOnly(today)
        : TimeUtils.dateOnly(afterPeriod);

    return this.earnings.createPeriodCorrection({
      locationId: result.locationId,
      staffId: result.staffId,
      resultId: result.id,
      amount,
      currency: result.currency,
      earnedOn,
      reason: dto.reason,
      actor,
    });
  }

  async findResultById(
    resultId: string,
  ): Promise<PayrollResult & { period: PayrollPeriod; staff: Staff }> {
    const result = await this.db.payrollResult.findUnique({
      where: { id: resultId },
      include: { period: true, staff: true },
    });
    if (!result)
      throw new AppException(
        ErrorCode.PAYROLL_RESULT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return result;
  }

  private emitPayrollAudit(
    locationId: string,
    entityId: string,
    eventType: AuditEvent,
    actionType: AuditActionType,
    actor: AuditActor,
    payload: AuditPayload,
  ): void {
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.PAYROLL,
      entityId,
      eventType,
      actionType,
      occurredAt: new Date(),
      actor,
      payload,
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}

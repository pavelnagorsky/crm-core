import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PayrollPeriod, PayrollPeriodStatus, PayrollResult, Prisma, Staff, StaffEarning } from '@prisma/client';
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
import { CreatePayrollCorrectionDto } from './dto/create-payroll-correction.dto.js';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto.js';
import { PayrollPeriodSearchOrderBy, PayrollPeriodSearchRequestDto } from './dto/payroll-period-search-request.dto.js';
import { PayrollPeriodWithResults } from './interfaces/payroll-period-with-results.interface.js';
import { PayrollComputeService } from './payroll-compute.service.js';
import { StaffCompensationService } from '../compensation/staff-compensation.service.js';
import { StaffEarningsService } from '../earnings/staff-earnings.service.js';
import { dateOnly, dateOnlyStr, dec } from '../utils/money.js';

const EDITABLE_STATUSES: PayrollPeriodStatus[] = [PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.CALCULATED];

@Injectable()
export class PayrollService {
  constructor(
    private readonly db: DatabaseService,
    private readonly earnings: StaffEarningsService,
    private readonly compensation: StaffCompensationService,
    private readonly compute: PayrollComputeService,
    private readonly staffService: StaffService,
    private readonly businessService: BusinessService,
    private readonly time: TimeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreatePayrollPeriodDto, actor: AuditActor): Promise<PayrollPeriodWithResults> {
    const startDate = dateOnly(dto.startDate);
    const endDate = dateOnly(dto.endDate);
    if (endDate < startDate) throw new AppException(ErrorCode.PAYROLL_PERIOD_DATES_INVALID, HttpStatus.BAD_REQUEST);

    const overlap = await this.db.payrollPeriod.findFirst({
      where: {
        businessId: dto.businessId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) throw new AppException(ErrorCode.PAYROLL_PERIOD_OVERLAP, HttpStatus.CONFLICT);

    const { currency } = await this.businessService.getLocale(dto.businessId);

    try {
      const period = await this.db.payrollPeriod.create({
        data: {
          businessId: dto.businessId,
          name: dto.name ?? null,
          startDate,
          endDate,
          currency,
        },
        include: { results: true },
      });
      this.emitPayrollAudit(dto.businessId, period.id, AuditEvent.PAYROLL_PERIOD_CREATED, AuditActionType.CREATE, actor, {
        startDate: dto.startDate,
        endDate: dto.endDate,
      });
      return period;
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new AppException(ErrorCode.PAYROLL_PERIOD_OVERLAP, HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  async search(businessId: string, dto: PayrollPeriodSearchRequestDto): Promise<PaginatedResult<PayrollPeriod>> {
    const where: Prisma.PayrollPeriodWhereInput = { businessId };
    if (dto.status) where.status = dto.status;

    const orderBy: Prisma.PayrollPeriodOrderByWithRelationInput = {
      [dto.orderBy ?? PayrollPeriodSearchOrderBy.START_DATE]: dto.orderDirection ?? OrderDirection.DESC,
    };

    const findArgs: Prisma.PayrollPeriodFindManyArgs = { where, orderBy };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.payrollPeriod.findMany(findArgs),
      this.db.payrollPeriod.count({ where }),
    ]);
    return { items, totalItems };
  }

  async findById(periodId: string): Promise<PayrollPeriodWithResults> {
    const period = await this.db.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { results: { orderBy: { staffName: 'asc' } } },
    });
    if (!period) throw new AppException(ErrorCode.PAYROLL_PERIOD_NOT_FOUND, HttpStatus.NOT_FOUND);
    return period;
  }

  async delete(periodId: string, actor: AuditActor): Promise<void> {
    const period = await this.findById(periodId);
    if (!EDITABLE_STATUSES.includes(period.status)) {
      throw new AppException(ErrorCode.PAYROLL_PERIOD_INVALID_STATUS, HttpStatus.CONFLICT);
    }
    await this.db.$transaction(async (tx) => {
      await this.earnings.detachPeriodEarnings(periodId, tx);
      await this.earnings.deleteDraftPeriodComponents(period.businessId, periodId, period.startDate, period.endDate, tx);
      await tx.payrollPeriod.delete({ where: { id: periodId } });
    });
    this.emitPayrollAudit(period.businessId, periodId, AuditEvent.PAYROLL_PERIOD_DELETED, AuditActionType.DELETE, actor, {});
  }

  async calculate(periodId: string, actor: AuditActor): Promise<PayrollPeriodWithResults> {
    const period = await this.findById(periodId);
    if (!EDITABLE_STATUSES.includes(period.status)) {
      throw new AppException(ErrorCode.PAYROLL_PERIOD_INVALID_STATUS, HttpStatus.CONFLICT);
    }

    const staff = await this.staffService.listInBusiness(period.businessId);
    const staffById = new Map(staff.map((s) => [s.id, s]));
    const [shifts, plans] = await Promise.all([
      this.staffService.listShiftsInRange(period.businessId, period.startDate, period.endDate),
      this.compensation.listOverlapping(
        staff.map((s) => s.id),
        period.startDate,
        period.endDate,
      ),
    ]);
    const dates = this.time.enumerateDates(dateOnlyStr(period.startDate), dateOnlyStr(period.endDate));

    const updated = await this.db.$transaction(async (tx) => {
      await this.earnings.detachPeriodEarnings(periodId, tx);
      await this.earnings.deleteDraftPeriodComponents(period.businessId, periodId, period.startDate, period.endDate, tx);
      await tx.payrollResult.deleteMany({ where: { periodId } });

      for (const shift of shifts) {
        const plan = this.compute.planOnDate(
          plans.filter((p) => p.staffId === shift.staffId),
          shift.date,
        );
        await this.earnings.materializeHourly(period.businessId, period.currency, shift, plan ?? null, tx);
      }

      let unpaid = this.compute.matchingCurrency(
        await this.earnings.listUnpaidThrough(period.businessId, period.endDate, tx),
        period.currency,
      );
      const unpaidByStaff = this.compute.groupByStaff(unpaid);
      const salaryStaffIds = new Set(plans.filter((p) => p.fixedSalaryAmount !== null).map((p) => p.staffId));

      for (const staffId of salaryStaffIds) {
        const proration = this.compute.prorateSalary(
          plans.filter((p) => p.staffId === staffId && p.fixedSalaryAmount !== null),
          dates,
        );
        const amount = this.compute.salaryAmount(
          proration,
          this.compute.inDateRange(unpaidByStaff.get(staffId) ?? [], period.startDate, period.endDate),
        );
        if (amount.lte(0)) continue;

        await this.earnings.materializeSalary(
          {
            businessId: period.businessId,
            staffId,
            periodId,
            earnedOn: period.endDate,
            currency: period.currency,
            amount,
            rateAmount: proration.lastSalary,
            quantity: dec(proration.daysCovered),
            planId: proration.planId,
          },
          tx,
        );
      }

      unpaid = this.compute.matchingCurrency(
        await this.earnings.listUnpaidThrough(period.businessId, period.endDate, tx),
        period.currency,
      );

      for (const [staffId, rows] of this.compute.groupByStaff(unpaid)) {
        const member = staffById.get(staffId);
        if (!member || rows.length === 0) continue;
        const totals = this.compute.totalsFrom(rows);
        const result = await tx.payrollResult.create({
          data: {
            periodId,
            businessId: period.businessId,
            staffId,
            staffName: member.name,
            roleTitle: member.roleTitle,
            taxId: member.taxId,
            employeeNumber: member.employeeNumber,
            employmentType: member.employmentType,
            payoutMethod: member.payoutMethod,
            payoutNote: member.payoutNote,
            currency: period.currency,
            ...totals,
          },
        });
        await this.earnings.attachToResult(rows.map((r) => r.id), result.id, tx);
      }

      return tx.payrollPeriod.update({
        where: { id: periodId },
        data: { status: PayrollPeriodStatus.CALCULATED, calculatedAt: new Date() },
        include: { results: { orderBy: { staffName: 'asc' } } },
      });
    }, { timeout: 30_000 });

    this.emitPayrollAudit(period.businessId, periodId, AuditEvent.PAYROLL_CALCULATED, AuditActionType.ACTION, actor, {
      staffCount: updated.results.length,
    });
    return updated;
  }

  async approve(periodId: string, actor: AuditActor): Promise<PayrollPeriodWithResults> {
    const period = await this.findById(periodId);
    if (period.status !== PayrollPeriodStatus.CALCULATED) {
      throw new AppException(ErrorCode.PAYROLL_PERIOD_INVALID_STATUS, HttpStatus.CONFLICT);
    }
    const updated = await this.db.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: PayrollPeriodStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: actor.id ?? null,
        approvedByName: actor.name,
      },
      include: { results: { orderBy: { staffName: 'asc' } } },
    });
    this.emitPayrollAudit(period.businessId, periodId, AuditEvent.PAYROLL_APPROVED, AuditActionType.ACTION, actor, {});
    return updated;
  }

  async pay(periodId: string, actor: AuditActor): Promise<PayrollPeriodWithResults> {
    const period = await this.findById(periodId);
    if (period.status !== PayrollPeriodStatus.APPROVED) {
      throw new AppException(ErrorCode.PAYROLL_PERIOD_INVALID_STATUS, HttpStatus.CONFLICT);
    }
    const updated = await this.db.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: PayrollPeriodStatus.PAID,
        paidAt: new Date(),
        paidById: actor.id ?? null,
        paidByName: actor.name,
      },
      include: { results: { orderBy: { staffName: 'asc' } } },
    });
    this.emitPayrollAudit(period.businessId, periodId, AuditEvent.PAYROLL_PAID, AuditActionType.ACTION, actor, {});
    return updated;
  }

  async correct(resultId: string, dto: CreatePayrollCorrectionDto, actor: AuditActor): Promise<StaffEarning> {
    const result = await this.db.payrollResult.findUnique({
      where: { id: resultId },
      include: { period: true },
    });
    if (!result) throw new AppException(ErrorCode.PAYROLL_RESULT_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (
      result.period.status !== PayrollPeriodStatus.APPROVED &&
      result.period.status !== PayrollPeriodStatus.PAID
    ) {
      throw new AppException(ErrorCode.PAYROLL_CORRECTION_NOT_ALLOWED, HttpStatus.CONFLICT);
    }

    const amount = dec(dto.amount);
    if (amount.isZero()) throw new AppException(ErrorCode.STAFF_EARNING_AMOUNT_INVALID, HttpStatus.BAD_REQUEST);

    const { timezone } = await this.businessService.getLocale(result.businessId);
    const today = this.time.zonedDateStr(new Date(), timezone);
    const afterPeriod = this.time.addDaysStr(dateOnlyStr(result.period.endDate), 1);
    const earnedOn = today > dateOnlyStr(result.period.endDate) ? dateOnly(today) : dateOnly(afterPeriod);

    return this.earnings.createPeriodCorrection({
      businessId: result.businessId,
      staffId: result.staffId,
      resultId: result.id,
      amount,
      currency: result.currency,
      earnedOn,
      reason: dto.reason,
      actor,
    });
  }

  async findResultById(resultId: string): Promise<PayrollResult & { period: PayrollPeriod; staff: Staff }> {
    const result = await this.db.payrollResult.findUnique({
      where: { id: resultId },
      include: { period: true, staff: true },
    });
    if (!result) throw new AppException(ErrorCode.PAYROLL_RESULT_NOT_FOUND, HttpStatus.NOT_FOUND);
    return result;
  }

  private emitPayrollAudit(
    businessId: string,
    entityId: string,
    eventType: AuditEvent,
    actionType: AuditActionType,
    actor: AuditActor,
    payload: AuditPayload,
  ): void {
    const event: AuditLogEvent = {
      businessId,
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

import { Injectable } from '@nestjs/common';
import { PayrollPeriodStatus, Prisma, StaffEarning } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { CompensationPlanWithRates } from '../../compensation/interfaces/compensation-plan-with-rates.interface.js';
import { StaffCompensationService } from '../../compensation/services/staff-compensation.service.js';
import { StaffEarningsService } from '../../earnings/services/staff-earnings.service.js';
import { PayrollCalculator } from '../calculators/payroll.calculator.js';
import { PayrollCalculationContext } from '../interfaces/payroll-calculation-context.interface.js';
import { PayrollPeriodWithResults } from '../interfaces/payroll-period-with-results.interface.js';
import { PayrollPeriodLockService } from './payroll-period-lock.service.js';

@Injectable()
export class PayrollCalculationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly earnings: StaffEarningsService,
    private readonly compensation: StaffCompensationService,
    private readonly compute: PayrollCalculator,
    private readonly staff: StaffService,
    private readonly locks: PayrollPeriodLockService,
  ) {}

  async calculate(
    period: PayrollPeriodWithResults,
  ): Promise<PayrollPeriodWithResults> {
    const context = await this.prepare(period);
    return this.db.$transaction(
      async (tx) => {
        await this.locks.lockUnchangedPeriod(period, tx);
        await this.clearDraft(period, tx);
        await this.materializeHourly(context, tx);
        await this.materializeSalary(context, tx);
        const unpaid = await this.unpaid(period, tx);
        await this.createResults(context, unpaid, tx);
        return tx.payrollPeriod.update({
          where: { id: period.id },
          data: {
            status: PayrollPeriodStatus.CALCULATED,
            calculatedAt: new Date(),
          },
          include: { results: { orderBy: { staffName: 'asc' } } },
        });
      },
      { timeout: 30_000 },
    );
  }

  private async prepare(
    period: PayrollPeriodWithResults,
  ): Promise<PayrollCalculationContext> {
    const staff = await this.staff.listInLocation(period.locationId);
    const [shifts, plans] = await Promise.all([
      this.staff.listShiftsInRange(
        period.locationId,
        period.startDate,
        period.endDate,
      ),
      this.compensation.listOverlapping(
        staff.map((member) => member.id),
        period.startDate,
        period.endDate,
      ),
    ]);
    const plansByStaff = new Map<string, CompensationPlanWithRates[]>();
    for (const plan of plans) {
      const group = plansByStaff.get(plan.staffId) ?? [];
      group.push(plan);
      plansByStaff.set(plan.staffId, group);
    }
    return {
      period,
      staffById: new Map(staff.map((member) => [member.id, member])),
      shifts,
      plansByStaff,
      dates: TimeUtils.enumerateDates(
        TimeUtils.dateOnlyStr(period.startDate),
        TimeUtils.dateOnlyStr(period.endDate),
      ),
    };
  }

  private async clearDraft(
    period: PayrollPeriodWithResults,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.earnings.detachPeriodEarnings(period.id, tx);
    await this.earnings.deleteDraftPeriodComponents(
      period.locationId,
      period.id,
      period.startDate,
      period.endDate,
      tx,
    );
    await tx.payrollResult.deleteMany({ where: { periodId: period.id } });
  }

  private async materializeHourly(
    context: PayrollCalculationContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const shift of context.shifts) {
      const plan = this.compute.planOnDate(
        context.plansByStaff.get(shift.staffId) ?? [],
        shift.date,
      );
      await this.earnings.materializeHourly(
        context.period.locationId,
        context.period.currency,
        shift,
        plan ?? null,
        tx,
      );
    }
  }

  private async materializeSalary(
    context: PayrollCalculationContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { period } = context;
    const unpaidByStaff = this.compute.groupByStaff(
      await this.unpaid(period, tx),
    );
    for (const [staffId, staffPlans] of context.plansByStaff) {
      const salaryPlans = staffPlans.filter(
        (plan) => plan.fixedSalaryAmount !== null,
      );
      if (salaryPlans.length === 0) continue;
      const proration = this.compute.prorateSalary(salaryPlans, context.dates);
      const amount = this.compute.salaryAmount(
        proration,
        this.compute.inDateRange(
          unpaidByStaff.get(staffId) ?? [],
          period.startDate,
          period.endDate,
        ),
      );
      if (amount.lte(0)) continue;
      await this.earnings.materializeSalary(
        {
          locationId: period.locationId,
          staffId,
          periodId: period.id,
          earnedOn: period.endDate,
          currency: period.currency,
          amount,
          rateAmount: proration.lastSalary,
          quantity: MoneyUtils.decimal(proration.daysCovered),
          planId: proration.planId,
        },
        tx,
      );
    }
  }

  private async unpaid(
    period: PayrollPeriodWithResults,
    tx: Prisma.TransactionClient,
  ): Promise<StaffEarning[]> {
    return this.compute.matchingCurrency(
      await this.earnings.listUnpaidThrough(
        period.locationId,
        period.endDate,
        tx,
      ),
      period.currency,
    );
  }

  private async createResults(
    context: PayrollCalculationContext,
    unpaid: StaffEarning[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { period } = context;
    for (const [staffId, rows] of this.compute.groupByStaff(unpaid)) {
      const member = context.staffById.get(staffId);
      if (!member || rows.length === 0) continue;
      const result = await tx.payrollResult.create({
        data: {
          periodId: period.id,
          locationId: period.locationId,
          staffId,
          staffName: member.name,
          roleTitle: member.roleTitle,
          taxId: member.taxId,
          employeeNumber: member.employeeNumber,
          employmentType: member.employmentType,
          payoutMethod: member.payoutMethod,
          payoutNote: member.payoutNote,
          currency: period.currency,
          ...this.compute.totalsFrom(rows),
        },
      });
      await this.earnings.attachToResult(
        rows.map((row) => row.id),
        result.id,
        tx,
      );
    }
  }
}

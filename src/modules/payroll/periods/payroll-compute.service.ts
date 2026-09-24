import { Injectable } from '@nestjs/common';
import { CompensationSalaryMode, Prisma, StaffEarningType } from '@prisma/client';
import { EarningCalculatorService } from '../earnings/earning-calculator.service.js';
import { planCoversDate } from '../compensation/compensation-plan.rules.js';
import { EarningLine } from '../earnings/interfaces/earning-line.interface.js';
import { PayrollTotals } from './interfaces/payroll-totals.interface.js';
import { SalaryPlanSlice } from './interfaces/salary-plan-slice.interface.js';
import { SalaryProration } from './interfaces/salary-proration.interface.js';
import { dateOnly, daysInUtcMonth, dec } from '../utils/money.js';

const FLOOR_TYPES: ReadonlySet<StaffEarningType> = new Set([
  StaffEarningType.SERVICE_COMMISSION,
  StaffEarningType.PRODUCT_COMMISSION,
  StaffEarningType.HOURLY,
]);

@Injectable()
export class PayrollComputeService {
  constructor(private readonly calculator: EarningCalculatorService) {}

  planOnDate<T extends SalaryPlanSlice>(plans: T[], day: Date): T | undefined {
    return plans
      .filter((plan) => planCoversDate(plan, day))
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
  }

  prorateSalary(plans: SalaryPlanSlice[], dateStrs: string[]): SalaryProration {
    let prorated = dec(0);
    let planId: string | null = null;
    let mode: CompensationSalaryMode = CompensationSalaryMode.GUARANTEED_MINIMUM;
    let lastSalary = dec(0);
    let daysCovered = 0;

    for (const iso of dateStrs) {
      const day = dateOnly(iso);
      const plan = this.planOnDate(plans, day);
      if (!plan || plan.fixedSalaryAmount === null) continue;
      prorated = prorated.plus(this.calculator.dailySalaryShare(plan.fixedSalaryAmount, daysInUtcMonth(day)));
      planId = plan.id;
      mode = plan.salaryMode;
      lastSalary = dec(plan.fixedSalaryAmount);
      daysCovered += 1;
    }

    return {
      prorated: prorated.toDecimalPlaces(2),
      planId,
      mode,
      lastSalary,
      daysCovered,
    };
  }

  /**
   * Work-based earnings that a guaranteed salary may top up.
   * Manual lines stay outside the floor. A reversed original does not count.
   */
  floorBase(earnings: EarningLine[]): Prisma.Decimal {
    const reversedIds = new Set(
      earnings.map((row) => row.reversesEarningId).filter((id): id is string => Boolean(id)),
    );
    return earnings
      .filter((row) => FLOOR_TYPES.has(row.type) && !reversedIds.has(row.id ?? ''))
      .reduce((acc, row) => acc.plus(row.amount), dec(0));
  }

  inDateRange<T extends { earnedOn: Date }>(rows: T[], from: Date, to: Date): T[] {
    const start = from.getTime();
    const end = to.getTime();
    return rows.filter((row) => {
      const t = row.earnedOn.getTime();
      return t >= start && t <= end;
    });
  }

  salaryAmount(proration: SalaryProration, workEarnings: EarningLine[]): Prisma.Decimal {
    if (proration.prorated.lte(0)) return dec(0);
    if (proration.mode === CompensationSalaryMode.ADDITIVE) return proration.prorated;
    return this.calculator.guaranteedTopUp(proration.prorated, this.floorBase(workEarnings));
  }

  groupByStaff<T extends { staffId: string }>(rows: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.staffId) ?? [];
      list.push(row);
      map.set(row.staffId, list);
    }
    return map;
  }

  matchingCurrency<T extends { currency: string }>(rows: T[], currency: string): T[] {
    return rows.filter((row) => row.currency === currency);
  }

  totalsFrom(rows: EarningLine[]): PayrollTotals {
    const fields: PayrollTotals = {
      fixedSalaryTotal: dec(0),
      hourlyTotal: dec(0),
      serviceCommissionTotal: dec(0),
      productCommissionTotal: dec(0),
      bonusTotal: dec(0),
      deductionTotal: dec(0),
      correctionTotal: dec(0),
      totalAmount: dec(0),
      earningsCount: rows.length,
    };
    for (const row of rows) {
      const amount = dec(row.amount);
      fields.totalAmount = fields.totalAmount.plus(amount);
      switch (row.type) {
        case StaffEarningType.FIXED_SALARY:
          fields.fixedSalaryTotal = fields.fixedSalaryTotal.plus(amount);
          break;
        case StaffEarningType.HOURLY:
          fields.hourlyTotal = fields.hourlyTotal.plus(amount);
          break;
        case StaffEarningType.SERVICE_COMMISSION:
          fields.serviceCommissionTotal = fields.serviceCommissionTotal.plus(amount);
          break;
        case StaffEarningType.PRODUCT_COMMISSION:
          fields.productCommissionTotal = fields.productCommissionTotal.plus(amount);
          break;
        case StaffEarningType.BONUS:
          fields.bonusTotal = fields.bonusTotal.plus(amount);
          break;
        case StaffEarningType.DEDUCTION:
          fields.deductionTotal = fields.deductionTotal.plus(amount);
          break;
        case StaffEarningType.CORRECTION:
          fields.correctionTotal = fields.correctionTotal.plus(amount);
          break;
        default: {
          const _exhaustive: never = row.type;
          throw new Error(`Unhandled earning type: ${_exhaustive}`);
        }
      }
    }
    return fields;
  }
}

import { CompensationSalaryMode, StaffEarningType } from '@prisma/client';
import { EarningCalculatorService } from '../earnings/earning-calculator.service.js';
import { SalaryPlanSlice } from './interfaces/salary-plan-slice.interface.js';
import { PayrollComputeService } from './payroll-compute.service.js';
import { dateOnly, money } from '../utils/money.js';
import { TimeService } from '../../time/time.service.js';

function earning(type: StaffEarningType, amount: string, staffId = 'anna') {
  return { staffId, type, amount, currency: 'RUB' };
}

describe('PayrollComputeService', () => {
  const compute = new PayrollComputeService(new EarningCalculatorService());
  const time = new TimeService();

  const september = time.enumerateDates('2026-09-01', '2026-09-30');

  const salaryPlan = (
    id: string,
    from: string,
    to: string | null,
    amount: string,
    mode: CompensationSalaryMode = CompensationSalaryMode.GUARANTEED_MINIMUM,
  ): SalaryPlanSlice => ({
    id,
    effectiveFrom: dateOnly(from),
    effectiveTo: to ? dateOnly(to) : null,
    fixedSalaryAmount: amount,
    salaryMode: mode,
  });

  it('prorates a monthly salary across the actual calendar days', () => {
    const full = compute.prorateSalary([salaryPlan('p1', '2026-09-01', null, '30000')], september);
    expect(money(full.prorated)).toBe('30000.00');
    expect(full.daysCovered).toBe(30);

    const late = compute.prorateSalary([salaryPlan('p1', '2026-09-10', null, '30000')], september);
    expect(money(late.prorated)).toBe('21000.00');
    expect(late.daysCovered).toBe(21);
  });

  it('splits a mid-month salary change by day', () => {
    const result = compute.prorateSalary(
      [
        salaryPlan('old', '2026-09-01', '2026-09-15', '30000'),
        salaryPlan('next', '2026-09-16', null, '60000'),
      ],
      september,
    );
    expect(money(result.prorated)).toBe('45000.00');
    expect(result.planId).toBe('next');
    expect(result.lastSalary.toString()).toBe('60000');
  });

  it('does not let deductions inflate a guaranteed salary top-up', () => {
    const proration = compute.prorateSalary(
      [salaryPlan('p1', '2026-09-01', null, '40000')],
      september,
    );
    const workAndDeduction = [
      earning(StaffEarningType.SERVICE_COMMISSION, '28000'),
      earning(StaffEarningType.DEDUCTION, '-5000'),
      earning(StaffEarningType.BONUS, '1000'),
    ];

    expect(money(compute.floorBase(workAndDeduction))).toBe('28000.00');
    expect(money(compute.salaryAmount(proration, workAndDeduction))).toBe('12000.00');
  });

  it('adds a full salary on top in ADDITIVE mode', () => {
    const proration = compute.prorateSalary(
      [salaryPlan('p1', '2026-09-01', null, '40000', CompensationSalaryMode.ADDITIVE)],
      september,
    );
    expect(money(compute.salaryAmount(proration, [earning(StaffEarningType.SERVICE_COMMISSION, '28000')]))).toBe(
      '40000.00',
    );
  });

  it('pays nothing when the floor is already covered', () => {
    const proration = compute.prorateSalary(
      [salaryPlan('p1', '2026-09-01', null, '40000')],
      september,
    );
    expect(money(compute.salaryAmount(proration, [earning(StaffEarningType.HOURLY, '55000')]))).toBe('0.00');
  });

  it('aggregates signed totals so a reversal nets the original booking', () => {
    const totals = compute.totalsFrom([
      earning(StaffEarningType.SERVICE_COMMISSION, '20.00'),
      earning(StaffEarningType.CORRECTION, '-20.00'),
      earning(StaffEarningType.BONUS, '5.00'),
      earning(StaffEarningType.DEDUCTION, '-2.00'),
    ]);
    expect(money(totals.serviceCommissionTotal)).toBe('20.00');
    expect(money(totals.correctionTotal)).toBe('-20.00');
    expect(money(totals.bonusTotal)).toBe('5.00');
    expect(money(totals.deductionTotal)).toBe('-2.00');
    expect(money(totals.totalAmount)).toBe('3.00');
    expect(totals.earningsCount).toBe(4);
  });

  it('does not count a reversed commission toward the guaranteed floor', () => {
    const proration = compute.prorateSalary(
      [salaryPlan('p1', '2026-09-01', null, '40000')],
      september,
    );
    const rows = [
      { id: 'orig', type: StaffEarningType.SERVICE_COMMISSION, amount: '28000' },
      {
        id: 'rev',
        type: StaffEarningType.CORRECTION,
        amount: '-28000',
        reversesEarningId: 'orig',
      },
    ];
    expect(money(compute.floorBase(rows))).toBe('0.00');
    expect(money(compute.salaryAmount(proration, rows))).toBe('40000.00');
  });

  it('does not let prior-period carry-over shrink this period salary floor', () => {
    const proration = compute.prorateSalary(
      [salaryPlan('p1', '2026-09-01', null, '40000')],
      september,
    );
    const unpaid = [
      {
        ...earning(StaffEarningType.SERVICE_COMMISSION, '35000'),
        earnedOn: dateOnly('2026-08-20'),
      },
      {
        ...earning(StaffEarningType.SERVICE_COMMISSION, '5000'),
        earnedOn: dateOnly('2026-09-12'),
      },
    ];
    const inPeriod = compute.inDateRange(unpaid, dateOnly('2026-09-01'), dateOnly('2026-09-30'));
    expect(inPeriod).toHaveLength(1);
    expect(money(compute.salaryAmount(proration, inPeriod))).toBe('35000.00');
  });

  it('groups unpaid rows by staff and drops foreign-currency leftovers', () => {
    const rows = [
      { ...earning(StaffEarningType.SERVICE_COMMISSION, '10', 'anna'), currency: 'RUB' },
      { ...earning(StaffEarningType.SERVICE_COMMISSION, '8', 'anna'), currency: 'USD' },
      { ...earning(StaffEarningType.HOURLY, '4', 'ivan'), currency: 'RUB' },
    ];
    const rub = compute.matchingCurrency(rows, 'RUB');
    expect(rub).toHaveLength(2);
    expect(compute.groupByStaff(rub).get('anna')).toHaveLength(1);
    expect(compute.groupByStaff(rub).get('ivan')).toHaveLength(1);
  });
});

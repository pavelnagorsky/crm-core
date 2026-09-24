import { PayrollPeriodStatus, Prisma, type PayrollPeriod, type PayrollResult } from '@prisma/client';
import { BusinessService } from '../../business/business.service.js';
import { LocaleService } from '../../../shared/i18n/locale.service.js';
import { StaffEarningsService } from '../earnings/staff-earnings.service.js';
import { PayrollPeriodWithResults } from '../periods/interfaces/payroll-period-with-results.interface.js';
import { PayrollService } from '../periods/payroll.service.js';
import { dec, money } from '../utils/money.js';
import { PayrollReportResponseDto } from './dto/payroll-report-response.dto.js';
import { PayrollReportTotalsDto } from './dto/payroll-report-totals.dto.js';
import { PayrollReportService } from './payroll-report.service.js';

const FUND_FIELDS = [
  'fixedSalaryTotal',
  'hourlyTotal',
  'serviceCommissionTotal',
  'productCommissionTotal',
  'bonusTotal',
  'deductionTotal',
  'correctionTotal',
] as const satisfies readonly (keyof PayrollReportTotalsDto)[];

const ZERO_TOTALS: PayrollReportTotalsDto = {
  fixedSalaryTotal: '0.00',
  hourlyTotal: '0.00',
  serviceCommissionTotal: '0.00',
  productCommissionTotal: '0.00',
  bonusTotal: '0.00',
  deductionTotal: '0.00',
  correctionTotal: '0.00',
};

function result(
  id: string,
  staffName: string,
  parts: Partial<Record<(typeof FUND_FIELDS)[number], string>> = {},
): PayrollResult {
  const amounts = Object.fromEntries(FUND_FIELDS.map((field) => [field, parts[field] ?? '0'])) as Record<
    (typeof FUND_FIELDS)[number],
    string
  >;
  return {
    id,
    periodId: 'period-1',
    businessId: 'biz',
    staffId: id,
    staffName,
    roleTitle: null,
    taxId: null,
    employeeNumber: null,
    employmentType: null,
    payoutMethod: null,
    payoutNote: null,
    currency: 'RUB',
    fixedSalaryTotal: new Prisma.Decimal(amounts.fixedSalaryTotal),
    hourlyTotal: new Prisma.Decimal(amounts.hourlyTotal),
    serviceCommissionTotal: new Prisma.Decimal(amounts.serviceCommissionTotal),
    productCommissionTotal: new Prisma.Decimal(amounts.productCommissionTotal),
    bonusTotal: new Prisma.Decimal(amounts.bonusTotal),
    deductionTotal: new Prisma.Decimal(amounts.deductionTotal),
    correctionTotal: new Prisma.Decimal(amounts.correctionTotal),
    totalAmount: FUND_FIELDS.reduce((acc, field) => acc.plus(amounts[field]), dec(0)),
    earningsCount: 0,
    createdAt: new Date('2026-09-30T12:00:00.000Z'),
  };
}

function period(status: PayrollPeriodStatus, results: PayrollResult[]): PayrollPeriodWithResults {
  const base: PayrollPeriod = {
    id: 'period-1',
    businessId: 'biz',
    name: 'September',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-30T00:00:00.000Z'),
    currency: 'RUB',
    status,
    calculatedAt: new Date('2026-09-30T12:00:00.000Z'),
    approvedAt: null,
    paidAt: null,
    approvedById: null,
    approvedByName: null,
    paidById: null,
    paidByName: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-30T12:00:00.000Z'),
  };
  return { ...base, results };
}

function serviceFor(...periods: PayrollPeriodWithResults[]): PayrollReportService {
  const findById = vi.fn();
  for (const item of periods) findById.mockResolvedValueOnce(item);
  return new PayrollReportService(
    { findById } as unknown as PayrollService,
    { listByResultIds: vi.fn().mockResolvedValue([]) } as unknown as StaffEarningsService,
    { findById: vi.fn().mockResolvedValue({ name: 'Studio' }) } as unknown as BusinessService,
    { get: vi.fn() } as unknown as LocaleService,
  );
}

function expectFundInvariant(report: PayrollReportResponseDto): void {
  for (const field of FUND_FIELDS) {
    const fromLines = report.vedomost.reduce((acc, line) => acc.plus(line[field]), dec(0));
    expect(report.totals[field]).toBe(money(fromLines));
  }
  const fundSum = FUND_FIELDS.reduce((acc, field) => acc.plus(report.totals[field]), dec(0));
  expect(money(fundSum)).toBe(report.grandTotal);
  expect(report.staffCount).toBe(report.vedomost.length);
}

const MIXED = [
  result('anna', 'Anna', {
    fixedSalaryTotal: '40000',
    hourlyTotal: '1500.5',
    serviceCommissionTotal: '8000',
    productCommissionTotal: '250',
    bonusTotal: '1000',
    deductionTotal: '-500',
  }),
  result('boris', 'Boris', { correctionTotal: '-10.25' }),
  result('vera', 'Vera', { deductionTotal: '20', correctionTotal: '15' }),
  result('gleb', 'Gleb'),
];

describe('PayrollReportService fund totals', () => {
  it('returns zero fund totals for a calculated period with no rows', async () => {
    const report = await serviceFor(period(PayrollPeriodStatus.CALCULATED, [])).build('period-1');

    expect(report.currency).toBe('RUB');
    expect(report.grandTotal).toBe('0.00');
    expect(report.staffCount).toBe(0);
    expect(report.totals).toEqual(ZERO_TOTALS);
    expect(report.attention).toEqual({ staffWithDeductions: 0, staffWithCorrections: 0 });
    expectFundInvariant(report);
  });

  it('sums each vedomost column and keeps deduction and correction signs', async () => {
    const report = await serviceFor(period(PayrollPeriodStatus.CALCULATED, MIXED)).build('period-1');

    expect(report.totals).toEqual({
      fixedSalaryTotal: '40000.00',
      hourlyTotal: '1500.50',
      serviceCommissionTotal: '8000.00',
      productCommissionTotal: '250.00',
      bonusTotal: '1000.00',
      deductionTotal: '-480.00',
      correctionTotal: '4.75',
    });
    expect(report.attention).toEqual({ staffWithDeductions: 2, staffWithCorrections: 2 });
    expect(report.grandTotal).toBe('50275.25');
    expectFundInvariant(report);
  });

  it('follows the current vedomost after recalculation, approval, and payment', async () => {
    const calculated = period(PayrollPeriodStatus.CALCULATED, MIXED);
    const recalculated = period(PayrollPeriodStatus.CALCULATED, [
      result('anna', 'Anna', { fixedSalaryTotal: '100', deductionTotal: '-5' }),
    ]);
    const reports = serviceFor(
      calculated,
      recalculated,
      { ...recalculated, status: PayrollPeriodStatus.APPROVED },
      { ...recalculated, status: PayrollPeriodStatus.PAID },
    );

    const before = await reports.build('period-1');
    const after = await reports.build('period-1');
    const approved = await reports.build('period-1');
    const paid = await reports.build('period-1');

    expect(before.grandTotal).toBe('50275.25');
    expect(after.totals).toEqual({ ...ZERO_TOTALS, fixedSalaryTotal: '100.00', deductionTotal: '-5.00' });
    expect(after.attention).toEqual({ staffWithDeductions: 1, staffWithCorrections: 0 });
    expect(after.grandTotal).toBe('95.00');
    expect(after.staffCount).toBe(1);
    expectFundInvariant(after);
    expect(approved.totals).toEqual(after.totals);
    expect(approved.attention).toEqual(after.attention);
    expect(approved.grandTotal).toBe(after.grandTotal);
    expect(paid.totals).toEqual(after.totals);
    expect(paid.grandTotal).toBe(after.grandTotal);
  });
});

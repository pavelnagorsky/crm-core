import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import type { PayrollResultResponseDto } from '../../periods/dto/payroll-result-response.dto.js';
import { PayrollReportAttentionDto } from '../dto/payroll-report-attention.dto.js';
import { PayrollReportTotalsDto } from '../dto/payroll-report-totals.dto.js';

type FundField = keyof PayrollReportTotalsDto;
type FundLine = Pick<PayrollResultResponseDto, FundField | 'totalAmount'>;

export function summarizePayrollReport(lines: readonly FundLine[]) {
  const sums: Record<FundField, Prisma.Decimal> = {
    fixedSalaryTotal: MoneyUtils.decimal(0),
    hourlyTotal: MoneyUtils.decimal(0),
    serviceCommissionTotal: MoneyUtils.decimal(0),
    productCommissionTotal: MoneyUtils.decimal(0),
    bonusTotal: MoneyUtils.decimal(0),
    deductionTotal: MoneyUtils.decimal(0),
    correctionTotal: MoneyUtils.decimal(0),
  };
  let grand = MoneyUtils.decimal(0);
  let staffWithDeductions = 0;
  let staffWithCorrections = 0;

  for (const line of lines) {
    for (const field of Object.keys(sums) as FundField[]) {
      sums[field] = sums[field].plus(line[field]);
    }
    grand = grand.plus(line.totalAmount);
    if (!MoneyUtils.decimal(line.deductionTotal).isZero())
      staffWithDeductions += 1;
    if (!MoneyUtils.decimal(line.correctionTotal).isZero())
      staffWithCorrections += 1;
  }

  const totals = new PayrollReportTotalsDto();
  for (const field of Object.keys(sums) as FundField[])
    totals[field] = MoneyUtils.format(sums[field]);

  const attention = new PayrollReportAttentionDto();
  attention.staffWithDeductions = staffWithDeductions;
  attention.staffWithCorrections = staffWithCorrections;

  return {
    totals,
    attention,
    grandTotal: MoneyUtils.format(grand),
    staffCount: lines.length,
  };
}

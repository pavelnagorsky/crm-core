import { Prisma } from '@prisma/client';
import type { PayrollResultResponseDto } from '../periods/dto/payroll-result-response.dto.js';
import { dec, money } from '../utils/money.js';
import { PayrollReportAttentionDto } from './dto/payroll-report-attention.dto.js';
import { PayrollReportTotalsDto } from './dto/payroll-report-totals.dto.js';

type FundField = keyof PayrollReportTotalsDto;
type FundLine = Pick<PayrollResultResponseDto, FundField | 'totalAmount'>;

export function summarizePayrollReport(lines: readonly FundLine[]) {
  const sums: Record<FundField, Prisma.Decimal> = {
    fixedSalaryTotal: dec(0),
    hourlyTotal: dec(0),
    serviceCommissionTotal: dec(0),
    productCommissionTotal: dec(0),
    bonusTotal: dec(0),
    deductionTotal: dec(0),
    correctionTotal: dec(0),
  };
  let grand = dec(0);
  let staffWithDeductions = 0;
  let staffWithCorrections = 0;

  for (const line of lines) {
    for (const field of Object.keys(sums) as FundField[]) {
      sums[field] = sums[field].plus(line[field]);
    }
    grand = grand.plus(line.totalAmount);
    if (!dec(line.deductionTotal).isZero()) staffWithDeductions += 1;
    if (!dec(line.correctionTotal).isZero()) staffWithCorrections += 1;
  }

  const totals = new PayrollReportTotalsDto();
  for (const field of Object.keys(sums) as FundField[]) totals[field] = money(sums[field]);

  const attention = new PayrollReportAttentionDto();
  attention.staffWithDeductions = staffWithDeductions;
  attention.staffWithCorrections = staffWithCorrections;

  return { totals, attention, grandTotal: money(grand), staffCount: lines.length };
}

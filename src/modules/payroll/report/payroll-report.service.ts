import { Injectable } from '@nestjs/common';
import { BusinessService } from '../../business/business.service.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxSheet } from '../../../shared/xlsx/interfaces/xlsx-sheet.interface.js';
import { XlsxService } from '../../../shared/xlsx/xlsx.service.js';
import { StaffEarningResponseDto } from '../earnings/dto/staff-earning-response.dto.js';
import { PayrollPayslipDto, PayrollReportResponseDto } from './dto/payroll-report-response.dto.js';
import { PayrollPeriodResponseDto } from '../periods/dto/payroll-period-response.dto.js';
import { PayrollResultResponseDto } from '../periods/dto/payroll-result-response.dto.js';
import { PayrollService } from '../periods/payroll.service.js';
import { StaffEarningsService } from '../earnings/staff-earnings.service.js';
import { summarizePayrollReport } from './payroll-report-summary.js';
import { DEFAULT_LANG, LocaleService } from '../../../shared/i18n/locale.service.js';
import { labelOf } from '../../../shared/i18n/label-of.js';
import { I18nLocale } from '../../../shared/interfaces/i18n-locale.interface.js';

@Injectable()
export class PayrollReportService {
  constructor(
    private readonly payroll: PayrollService,
    private readonly earnings: StaffEarningsService,
    private readonly businessService: BusinessService,
    private readonly locale: LocaleService,
  ) {}

  async build(periodId: string): Promise<PayrollReportResponseDto> {
    const period = await this.payroll.findById(periodId);
    const business = await this.businessService.findById(period.businessId);
    const earningRows = await this.earnings.listByResultIds(period.results.map((r) => r.id));
    const byResult = new Map<string, typeof earningRows>();
    for (const row of earningRows) {
      if (!row.payrollResultId) continue;
      const list = byResult.get(row.payrollResultId) ?? [];
      list.push(row);
      byResult.set(row.payrollResultId, list);
    }

    const mapped = PayrollPeriodResponseDto.fromEntity(period);
    const vedomost = period.results.map(PayrollResultResponseDto.fromEntity);
    const payslips: PayrollPayslipDto[] = vedomost.map((result) => ({
      result,
      earnings: (byResult.get(result.id) ?? []).map(StaffEarningResponseDto.fromEntity),
    }));
    const summary = summarizePayrollReport(vedomost);

    const dto = new PayrollReportResponseDto();
    dto.periodId = period.id;
    dto.businessName = business.name;
    dto.periodName = period.name;
    dto.startDate = mapped.startDate;
    dto.endDate = mapped.endDate;
    dto.currency = period.currency;
    dto.status = period.status;
    dto.grandTotal = summary.grandTotal;
    dto.staffCount = summary.staffCount;
    dto.totals = summary.totals;
    dto.attention = summary.attention;
    dto.vedomost = vedomost;
    dto.payslips = payslips;
    return dto;
  }

  async exportVedomost(periodId: string, lang = DEFAULT_LANG): Promise<XlsxFile> {
    const report = await this.build(periodId);
    const messages = this.locale.get(lang);
    const text = messages.documents;
    return XlsxService.write(`payroll-vedomost-${report.startDate}.xlsx`, (book) => {
      const sheet = book.addSheet(text.payroll.vedomostSheet);
      sheet.addRow([text.payroll.vedomostTitle]);
      sheet.addRow([text.common.business, report.businessName]);
      sheet.addRow([text.common.period, `${report.startDate} — ${report.endDate}`]);
      sheet.addRow([text.common.status, labelOf(messages.payrollPeriodStatus, report.status)]);
      sheet.addRow([text.common.currency, report.currency]);
      sheet.addRow([]);
      sheet.addRow([
        text.payroll.employeeNumberShort,
        text.common.staff,
        text.common.roleTitle,
        text.common.taxId,
        text.common.employmentType,
        text.common.payoutMethod,
        text.payroll.fixedSalary,
        text.payroll.hours,
        text.payroll.services,
        text.payroll.products,
        text.payroll.bonuses,
        text.payroll.deductions,
        text.payroll.corrections,
        text.payroll.toPay,
      ]);
      for (const line of report.vedomost) {
        sheet.addRow([
          line.employeeNumber ?? '',
          line.staffName,
          line.roleTitle ?? '',
          line.taxId ?? '',
          labelOf(messages.employmentType, line.employmentType),
          [labelOf(messages.payoutMethod, line.payoutMethod), line.payoutNote].filter(Boolean).join(' '),
          line.fixedSalaryTotal,
          line.hourlyTotal,
          line.serviceCommissionTotal,
          line.productCommissionTotal,
          line.bonusTotal,
          line.deductionTotal,
          line.correctionTotal,
          line.totalAmount,
        ]);
      }
      sheet.addRow([]);
      sheet.addRow([text.common.total, '', '', '', '', '', '', '', '', '', '', '', '', report.grandTotal]);
    });
  }

  async exportPayslips(periodId: string, lang = DEFAULT_LANG): Promise<XlsxFile> {
    const report = await this.build(periodId);
    const messages = this.locale.get(lang);
    const text = messages.documents;
    return XlsxService.write(`payroll-payslips-${report.startDate}.xlsx`, (book) => {
      if (report.payslips.length === 0) {
        book.addSheet(text.payroll.payslipsSheet).addRow([text.payroll.empty]);
        return;
      }

      for (const slip of report.payslips) {
        const sheet = book.addSheet(
          `${slip.result.staffName} ${slip.result.staffId.slice(0, 4)}`,
          text.payroll.fallbackSheet,
        );
        this.writePayslip(sheet, report, slip, messages);
      }
    });
  }

  private writePayslip(
    sheet: XlsxSheet,
    report: PayrollReportResponseDto,
    slip: PayrollPayslipDto,
    messages: I18nLocale,
  ): void {
    const text = messages.documents;
    sheet.addRow([text.payroll.payslipTitle]);
    sheet.addRow([text.common.business, report.businessName]);
    sheet.addRow([text.common.period, `${report.startDate} — ${report.endDate}`]);
    sheet.addRow([text.common.staff, slip.result.staffName]);
    sheet.addRow([text.common.roleTitle, slip.result.roleTitle ?? '']);
    sheet.addRow([text.common.employeeNumber, slip.result.employeeNumber ?? '']);
    sheet.addRow([text.common.taxId, slip.result.taxId ?? '']);
    sheet.addRow([text.common.employmentType, labelOf(messages.employmentType, slip.result.employmentType)]);
    sheet.addRow([
      text.common.payout,
      [labelOf(messages.payoutMethod, slip.result.payoutMethod), slip.result.payoutNote].filter(Boolean).join(' '),
    ]);
    sheet.addRow([]);
    sheet.addRow([
      text.common.date,
      text.common.type,
      text.common.description,
      text.common.base,
      text.common.ratePercent,
      text.common.rate,
      text.common.quantity,
      text.common.amount,
      text.common.reason,
    ]);
    for (const earning of slip.earnings) {
      sheet.addRow([
        earning.earnedOn,
        labelOf(messages.earningType, earning.type),
        earning.description ?? '',
        earning.baseAmount ?? '',
        earning.ratePercent ?? '',
        earning.rateAmount ?? '',
        earning.quantity ?? '',
        earning.amount,
        earning.reason ?? '',
      ]);
    }
    sheet.addRow([]);
    sheet.addRow([text.payroll.totalToPay, slip.result.totalAmount]);
  }
}

import { Injectable } from '@nestjs/common';
import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import { BusinessService } from '../../business/business.service.js';
import { ExportResult } from '../../../shared/export/export.service.js';
import { StaffEarningResponseDto } from '../earnings/dto/staff-earning-response.dto.js';
import { PayrollPayslipDto, PayrollReportResponseDto } from './dto/payroll-report-response.dto.js';
import { PayrollPeriodResponseDto } from '../periods/dto/payroll-period-response.dto.js';
import { PayrollResultResponseDto } from '../periods/dto/payroll-result-response.dto.js';
import { PayrollService } from '../periods/payroll.service.js';
import { StaffEarningsService } from '../earnings/staff-earnings.service.js';
import { dec, money } from '../utils/money.js';
import {
  EARNING_TYPE_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  PAYOUT_METHOD_LABEL,
  PAYROLL_STATUS_LABEL,
  labelOf,
  safeSheetName,
} from './payroll-report.labels.js';
import { addRow } from './excel-row.js';

@Injectable()
export class PayrollReportService {
  constructor(
    private readonly payroll: PayrollService,
    private readonly earnings: StaffEarningsService,
    private readonly businessService: BusinessService,
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
    const payslips: PayrollPayslipDto[] = period.results.map((result) => ({
      result: PayrollResultResponseDto.fromEntity(result),
      earnings: (byResult.get(result.id) ?? []).map(StaffEarningResponseDto.fromEntity),
    }));
    const grandTotal = period.results.reduce((acc, row) => acc.plus(row.totalAmount), dec(0));

    const dto = new PayrollReportResponseDto();
    dto.periodId = period.id;
    dto.businessName = business.name;
    dto.periodName = period.name;
    dto.startDate = mapped.startDate;
    dto.endDate = mapped.endDate;
    dto.currency = period.currency;
    dto.status = period.status;
    dto.grandTotal = money(grandTotal);
    dto.staffCount = period.results.length;
    dto.vedomost = vedomost;
    dto.payslips = payslips;
    return dto;
  }

  async exportVedomost(periodId: string): Promise<ExportResult> {
    const report = await this.build(periodId);
    const stream = new PassThrough();
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream });
    const sheet = workbook.addWorksheet('Ведомость');

    addRow(sheet, ['Ведомость на выплату']);
    addRow(sheet, ['Бизнес', report.businessName]);
    addRow(sheet, ['Период', `${report.startDate} — ${report.endDate}`]);
    addRow(sheet, ['Статус', labelOf(PAYROLL_STATUS_LABEL, report.status)]);
    addRow(sheet, ['Валюта', report.currency]);
    addRow(sheet, []);
    addRow(sheet, [
      'Таб. №',
      'Сотрудник',
      'Должность',
      'ИНН / УНП',
      'Оформление',
      'Способ выплаты',
      'Оклад',
      'Часы',
      'Услуги',
      'Товары',
      'Бонусы',
      'Удержания',
      'Корректировки',
      'К выплате',
    ]);
    for (const line of report.vedomost) {
      addRow(sheet, [
        line.employeeNumber ?? '',
        line.staffName,
        line.roleTitle ?? '',
        line.taxId ?? '',
        labelOf(EMPLOYMENT_TYPE_LABEL, line.employmentType),
        [labelOf(PAYOUT_METHOD_LABEL, line.payoutMethod), line.payoutNote].filter(Boolean).join(' '),
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
    addRow(sheet, []);
    addRow(sheet, ['Итого', '', '', '', '', '', '', '', '', '', '', '', '', report.grandTotal]);
    sheet.commit();
    void workbook.commit();
    return { stream, filename: `payroll-vedomost-${report.startDate}.xlsx` };
  }

  async exportPayslips(periodId: string): Promise<ExportResult> {
    const report = await this.build(periodId);
    const stream = new PassThrough();
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream });

    if (report.payslips.length === 0) {
      const empty = workbook.addWorksheet('Листки');
      addRow(empty, ['Нет результатов за период']);
      empty.commit();
    }

    for (const slip of report.payslips) {
      const sheet = workbook.addWorksheet(safeSheetName(`${slip.result.staffName} ${slip.result.staffId.slice(0, 4)}`));
      addRow(sheet, ['Расчётный листок']);
      addRow(sheet, ['Бизнес', report.businessName]);
      addRow(sheet, ['Период', `${report.startDate} — ${report.endDate}`]);
      addRow(sheet, ['Сотрудник', slip.result.staffName]);
      addRow(sheet, ['Должность', slip.result.roleTitle ?? '']);
      addRow(sheet, ['Табельный номер', slip.result.employeeNumber ?? '']);
      addRow(sheet, ['ИНН / УНП', slip.result.taxId ?? '']);
      addRow(sheet, ['Оформление', labelOf(EMPLOYMENT_TYPE_LABEL, slip.result.employmentType)]);
      addRow(sheet, ['Выплата', [labelOf(PAYOUT_METHOD_LABEL, slip.result.payoutMethod), slip.result.payoutNote].filter(Boolean).join(' ')]);
      addRow(sheet, []);
      addRow(sheet, ['Дата', 'Тип', 'Описание', 'База', 'Ставка %', 'Ставка', 'Кол-во', 'Сумма', 'Причина']);
      for (const earning of slip.earnings) {
        addRow(sheet, [
          earning.earnedOn,
          labelOf(EARNING_TYPE_LABEL, earning.type),
          earning.description ?? '',
          earning.baseAmount ?? '',
          earning.ratePercent ?? '',
          earning.rateAmount ?? '',
          earning.quantity ?? '',
          earning.amount,
          earning.reason ?? '',
        ]);
      }
      addRow(sheet, []);
      addRow(sheet, ['Итого к выплате', slip.result.totalAmount]);
      sheet.commit();
    }

    void workbook.commit();
    return { stream, filename: `payroll-payslips-${report.startDate}.xlsx` };
  }
}

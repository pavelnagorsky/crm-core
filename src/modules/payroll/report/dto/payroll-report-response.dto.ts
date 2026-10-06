import { ApiProperty } from '@nestjs/swagger';
import { ApiSignedAmount } from '../../../../shared/decorators/api-decimal.decorator.js';
import { PayrollPeriodStatus } from '../../periods/enums/payroll-period-status.enum.js';
import { PayrollResultResponseDto } from '../../periods/dto/payroll-result-response.dto.js';
import { PayrollReportAttentionDto } from './payroll-report-attention.dto.js';
import { PayrollReportTotalsDto } from './payroll-report-totals.dto.js';

export class PayrollPayslipDto {
  @ApiProperty({ type: () => PayrollResultResponseDto })
  result: PayrollResultResponseDto;
}

export class PayrollReportResponseDto {
  @ApiProperty({ type: String })
  periodId: string;

  @ApiProperty({ type: String })
  locationName: string;

  @ApiProperty({ type: String, nullable: true })
  periodName: string | null;

  @ApiProperty({ type: String })
  startDate: string;

  @ApiProperty({ type: String })
  endDate: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ enum: PayrollPeriodStatus, enumName: 'PayrollPeriodStatus' })
  status: PayrollPeriodStatus;

  @ApiSignedAmount()
  grandTotal: string;

  @ApiProperty({ type: Number })
  staffCount: number;

  @ApiProperty({ type: () => PayrollReportTotalsDto })
  totals: PayrollReportTotalsDto;

  @ApiProperty({ type: () => PayrollReportAttentionDto })
  attention: PayrollReportAttentionDto;

  @ApiProperty({ type: () => PayrollResultResponseDto, isArray: true })
  vedomost: PayrollResultResponseDto[];

  @ApiProperty({ type: () => PayrollPayslipDto, isArray: true })
  payslips: PayrollPayslipDto[];
}

import { ApiProperty } from '@nestjs/swagger';
import { PayrollPeriodStatus } from '../../periods/enums/payroll-period-status.enum.js';
import { StaffEarningResponseDto } from '../../earnings/dto/staff-earning-response.dto.js';
import { PayrollResultResponseDto } from '../../periods/dto/payroll-result-response.dto.js';

export class PayrollPayslipDto {
  @ApiProperty({ type: () => PayrollResultResponseDto })
  result: PayrollResultResponseDto;

  @ApiProperty({ type: () => StaffEarningResponseDto, isArray: true })
  earnings: StaffEarningResponseDto[];
}

export class PayrollReportResponseDto {
  @ApiProperty({ type: String })
  periodId: string;

  @ApiProperty({ type: String })
  businessName: string;

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

  @ApiProperty({ type: String })
  grandTotal: string;

  @ApiProperty({ type: Number })
  staffCount: number;

  @ApiProperty({ type: () => PayrollResultResponseDto, isArray: true })
  vedomost: PayrollResultResponseDto[];

  @ApiProperty({ type: () => PayrollPayslipDto, isArray: true })
  payslips: PayrollPayslipDto[];
}

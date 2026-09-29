import { ApiProperty } from '@nestjs/swagger';
import { PayrollPeriodStatus } from '../enums/payroll-period-status.enum.js';

export class PayrollPeriodStatusCountResponseDto {
  @ApiProperty({ enum: PayrollPeriodStatus, enumName: 'PayrollPeriodStatus' })
  status: PayrollPeriodStatus;

  @ApiProperty({ type: Number })
  count: number;
}

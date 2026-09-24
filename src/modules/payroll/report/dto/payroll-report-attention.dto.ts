import { ApiProperty } from '@nestjs/swagger';

export class PayrollReportAttentionDto {
  @ApiProperty({ type: Number })
  staffWithDeductions: number;

  @ApiProperty({ type: Number })
  staffWithCorrections: number;
}

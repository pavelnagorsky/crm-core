import { ApiProperty } from '@nestjs/swagger';

export class PayrollReportTotalsDto {
  @ApiProperty({ type: String })
  fixedSalaryTotal: string;

  @ApiProperty({ type: String })
  hourlyTotal: string;

  @ApiProperty({ type: String })
  serviceCommissionTotal: string;

  @ApiProperty({ type: String })
  productCommissionTotal: string;

  @ApiProperty({ type: String })
  bonusTotal: string;

  @ApiProperty({ type: String })
  deductionTotal: string;

  @ApiProperty({ type: String })
  correctionTotal: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PromotionReportPeriod } from '../enums/promotion-report-period.enum.js';

export class PromotionReportRequestDto {
  @ApiProperty({
    enum: PromotionReportPeriod,
    enumName: 'PromotionReportPeriod',
    required: false,
    default: PromotionReportPeriod.DAYS_30,
  })
  @IsOptional()
  @IsEnum(PromotionReportPeriod)
  period?: PromotionReportPeriod;
}

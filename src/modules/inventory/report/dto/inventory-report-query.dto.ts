import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import regularExpressions from '../../../../shared/regular-expressions.js';

export class InventoryReportQueryDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' })
  @Matches(regularExpressions.calendarDate)
  from: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  @Matches(regularExpressions.calendarDate)
  to: string;
}

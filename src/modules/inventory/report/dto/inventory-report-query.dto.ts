import { ApiProperty } from '@nestjs/swagger';
import { IsCalendarDate } from '../../../../shared/time/decorators/is-calendar-date.validator.js';

export class InventoryReportQueryDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' })
  @IsCalendarDate()
  from: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  @IsCalendarDate()
  to: string;
}

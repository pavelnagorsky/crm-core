import { ApiProperty } from '@nestjs/swagger';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';

export class FinanceSummaryRequestDto {
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-20',
    description: 'First day (YYYY-MM-DD) in the location timezone, inclusive.',
  })
  @IsCalendarDate()
  from: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-20',
    description:
      'Last day, inclusive. from <= to (400 DASHBOARD_CUSTOM_RANGE_INVALID), at most 62 days (400 FINANCE_SUMMARY_RANGE_TOO_LONG).',
  })
  @IsCalendarDate()
  to: string;
}

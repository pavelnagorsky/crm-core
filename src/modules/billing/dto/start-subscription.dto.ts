import { ApiProperty } from '@nestjs/swagger';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';

export class StartSubscriptionDto {
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-12-14',
    description:
      'First day without the trial (YYYY-MM-DD) in the brand timezone; the trial ends at its start',
  })
  @IsCalendarDate()
  trialEndsOn: string;
}

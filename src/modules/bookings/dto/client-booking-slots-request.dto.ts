import { ApiProperty } from '@nestjs/swagger';
import { IsDateRangeValid } from '../../staff/decorators/is-date-range-valid.decorator.js';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';

@IsDateRangeValid()
export class ClientBookingSlotsRequestDto {
  @ApiProperty({
    type: String,
    format: 'date',
    description: 'First date, inclusive. Maximum range is 62 days.',
  })
  @IsCalendarDate()
  from: string;

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Last date, inclusive.',
  })
  @IsCalendarDate()
  to: string;
}

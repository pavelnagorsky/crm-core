import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { IsDateRangeValid } from '../../staff/decorators/is-date-range-valid.decorator.js';

@IsDateRangeValid()
export class ClientBookingSlotsRequestDto {
  @ApiProperty({
    type: String,
    format: 'date',
    description: 'First date, inclusive. Maximum range is 62 days.',
  })
  @IsDateString({ strict: true })
  @Matches(regularExpressions.calendarDate)
  from: string;

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Last date, inclusive.',
  })
  @IsDateString({ strict: true })
  @Matches(regularExpressions.calendarDate)
  to: string;
}

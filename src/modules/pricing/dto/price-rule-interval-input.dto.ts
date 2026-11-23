import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';

export class PriceRuleIntervalInputDto {
  @ApiProperty({
    type: String,
    example: '17:00',
    description:
      'Start of the interval, HH:mm; the visit start minute must be at or after it.',
  })
  @Matches(regularExpressions.time)
  start: string;

  @ApiProperty({
    type: String,
    example: '21:00',
    description:
      'End of the interval, HH:mm or 24:00; the visit start minute must be before it.',
  })
  @Matches(regularExpressions.timeOrDayEnd)
  end: string;
}

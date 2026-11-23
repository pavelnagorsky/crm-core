import { ApiProperty } from '@nestjs/swagger';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceRuleIntervalMinutes } from '../interfaces/price-rule-interval-minutes.interface.js';

export class PriceRuleIntervalResponseDto {
  @ApiProperty({ type: String, example: '17:00' })
  start: string;

  @ApiProperty({
    type: String,
    example: '21:00',
    description: 'HH:mm, or 24:00 for the end of the day.',
  })
  end: string;

  static fromMinutes(
    interval: PriceRuleIntervalMinutes,
  ): PriceRuleIntervalResponseDto {
    const dto = new PriceRuleIntervalResponseDto();
    dto.start = TimeUtils.minutesToHHmm(interval.startMinute);
    dto.end = TimeUtils.minutesToHHmm(interval.endMinute);
    return dto;
  }
}

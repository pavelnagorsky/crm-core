import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleSkipReason } from '../engine/enums/price-rule-skip-reason.enum.js';
import { PriceExplainNotApplied } from '../interfaces/price-explain-not-applied.interface.js';
import { PriceRuleIntervalResponseDto } from './price-rule-interval-response.dto.js';

export class PriceExplainNotAppliedDto {
  @ApiProperty({ type: String })
  ruleId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ enum: PriceRuleSkipReason, enumName: 'PriceRuleSkipReason' })
  reason: PriceRuleSkipReason;

  @ApiProperty({
    type: () => PriceRuleIntervalResponseDto,
    isArray: true,
    description: 'Visit start intervals of the rule; empty: the whole day.',
  })
  intervals: PriceRuleIntervalResponseDto[];

  static fromNotApplied(
    item: PriceExplainNotApplied,
  ): PriceExplainNotAppliedDto {
    const dto = new PriceExplainNotAppliedDto();
    dto.ruleId = item.ruleId;
    dto.name = item.name;
    dto.reason = item.reason;
    dto.intervals = item.intervals.map(({ start, end }) =>
      PriceRuleIntervalResponseDto.fromMinutes({
        startMinute: start,
        endMinute: end,
      }),
    );
    return dto;
  }
}

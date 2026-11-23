import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleHolidayConflict } from '../interfaces/price-rule-holiday-conflict.interface.js';

export class PriceRulePreviewConflictDto {
  @ApiProperty({ type: String })
  ruleId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, example: '2026-12-31' })
  date: string;

  static fromConflict(
    conflict: PriceRuleHolidayConflict,
  ): PriceRulePreviewConflictDto {
    const dto = new PriceRulePreviewConflictDto();
    dto.ruleId = conflict.ruleId;
    dto.name = conflict.ruleName;
    dto.date = conflict.date;
    return dto;
  }
}

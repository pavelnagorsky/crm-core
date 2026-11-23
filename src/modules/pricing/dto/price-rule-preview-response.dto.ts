import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRulePreview } from '../interfaces/price-rule-preview.interface.js';
import { PriceRulePreviewConflictDto } from './price-rule-preview-conflict.dto.js';
import { PriceRulePreviewExampleDto } from './price-rule-preview-example.dto.js';
import { PriceRulePreviewReplacedDto } from './price-rule-preview-replaced.dto.js';

export class PriceRulePreviewResponseDto {
  @ApiProperty({ enum: PriceRuleStatus, enumName: 'PriceRuleStatus' })
  status: PriceRuleStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-12-05',
    description: 'First date the rule works, from today of the location.',
  })
  nextDate: string | null;

  @ApiProperty({
    type: () => PriceRulePreviewExampleDto,
    isArray: true,
    description:
      'Up to 3 affected services at nextDate: the base level and one other level.',
  })
  examples: PriceRulePreviewExampleDto[];

  @ApiProperty({
    type: () => PriceRulePreviewReplacedDto,
    isArray: true,
    description:
      'Exclusive holiday rule: the surcharges it replaces on its dates.',
  })
  replaces: PriceRulePreviewReplacedDto[];

  @ApiProperty({
    type: () => PriceRulePreviewConflictDto,
    isArray: true,
    description: 'Other exclusive holiday rules on the same dates.',
  })
  conflicts: PriceRulePreviewConflictDto[];

  static fromPreview(preview: PriceRulePreview): PriceRulePreviewResponseDto {
    const dto = new PriceRulePreviewResponseDto();
    dto.status = preview.status;
    dto.nextDate = preview.nextDate;
    dto.examples = preview.examples.map(PriceRulePreviewExampleDto.fromExample);
    dto.replaces = preview.replaces.map(
      PriceRulePreviewReplacedDto.fromReplaced,
    );
    dto.conflicts = preview.conflicts.map(
      PriceRulePreviewConflictDto.fromConflict,
    );
    return dto;
  }
}

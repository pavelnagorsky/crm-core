import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRulePreview } from '../interfaces/price-rule-preview.interface.js';
import { PriceRulePreviewConflictDto } from './price-rule-preview-conflict.dto.js';
import { PriceRulePreviewExampleDto } from './price-rule-preview-example.dto.js';
import { PriceRulePreviewReplacedDto } from './price-rule-preview-replaced.dto.js';
import { PromotionMatchesDto } from './promotion-matches.dto.js';
import { PromotionOverlapDto } from './promotion-overlap.dto.js';
import { PromotionProductExampleDto } from './promotion-product-example.dto.js';

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

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Promotion conditions as clients will read them; empty for a surcharge.',
  })
  conditions: string[];

  @ApiProperty({ type: Number, description: 'Distinct services the rule can touch.' })
  serviceCount: number;

  @ApiProperty({ type: Number, description: 'Services of the bookable catalog.' })
  totalServiceCount: number;

  @ApiProperty({
    type: Number,
    description: 'Promotion: products of the location it reaches; 0 for a surcharge.',
  })
  productCount: number;

  @ApiProperty({
    type: Number,
    description: 'Products the location sells (retail price set, for sale).',
  })
  totalProductCount: number;

  @ApiProperty({
    type: () => PromotionProductExampleDto,
    isArray: true,
    description:
      'Promotion: up to 5 reached products for one unit at nextDate, below the purchase cost first, then by name; empty without nextDate.',
  })
  productExamples: PromotionProductExampleDto[];

  @ApiProperty({
    type: Number,
    description:
      'Promotion: reached products whose price after the discount is below the last purchase cost.',
  })
  belowCostCount: number;

  @ApiProperty({
    type: () => PromotionOverlapDto,
    isArray: true,
    description:
      'Promotion: enabled promotions that meet it on a service or product, channel, staff member and time.',
  })
  overlaps: PromotionOverlapDto[];

  @ApiProperty({
    type: () => PromotionMatchesDto,
    nullable: true,
    description: 'Promotion: what it would have reached in the last 30 days; null for a surcharge.',
  })
  matches30d: PromotionMatchesDto | null;

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
    dto.conditions = preview.conditions;
    dto.serviceCount = preview.serviceCount;
    dto.totalServiceCount = preview.totalServiceCount;
    dto.productCount = preview.productCount;
    dto.totalProductCount = preview.totalProductCount;
    dto.productExamples = preview.productExamples.map(
      PromotionProductExampleDto.fromExample,
    );
    dto.belowCostCount = preview.belowCostCount;
    dto.overlaps = preview.overlaps.map(PromotionOverlapDto.fromOverlap);
    dto.matches30d =
      preview.matches30d === null
        ? null
        : PromotionMatchesDto.fromMatches(preview.matches30d);
    return dto;
  }
}

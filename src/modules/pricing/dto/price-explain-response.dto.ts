import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { PriceExplainKind } from '../enums/price-explain-kind.enum.js';
import { PriceExplain } from '../interfaces/price-explain.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';
import { PriceExplainCandidateDto } from './price-explain-candidate.dto.js';
import { PromoCodeResultDto } from './promo-code-result.dto.js';
import { PriceExplainLineDto } from './price-explain-line.dto.js';
import { PriceExplainNotAppliedDto } from './price-explain-not-applied.dto.js';

export class PriceExplainResponseDto {
  @ApiProperty({
    enum: PriceExplainKind,
    enumName: 'PriceExplainKind',
    description:
      'PRODUCT: line.basePrice = line.staffPrice = retail price of one unit; line.listPrice = the line by the price list (quantity); chargedPrice and total = the line with the discount; candidates empty, levelName null, notApplied only promotions.',
  })
  kind: PriceExplainKind;

  @ApiUnitCost(true)
  lastPurchaseUnitCost: string | null;

  @ApiProperty({
    type: Boolean,
    description:
      'Product: the line total is below the last purchase cost of the quantity (computed without Read(INVENTORY) too); false for a service.',
  })
  belowCost: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The staff member priced; null when "any staff" found nobody free.',
  })
  staffId: string | null;

  @ApiProperty({ type: String, nullable: true })
  staffName: string | null;

  @ApiProperty({ type: String, nullable: true })
  levelName: string | null;

  @ApiPrice()
  total: string;

  @ApiProperty({
    type: () => PriceExplainLineDto,
    description: 'A bundle is summed over its lines.',
  })
  line: PriceExplainLineDto;

  @ApiProperty({ type: () => PriceExplainCandidateDto, isArray: true })
  candidates: PriceExplainCandidateDto[];

  @ApiProperty({ type: () => PriceExplainNotAppliedDto, isArray: true })
  notApplied: PriceExplainNotAppliedDto[];

  @ApiProperty({
    type: () => PromoCodeResultDto,
    nullable: true,
    description: 'What the promo code did; null without one.',
  })
  promoCode: PromoCodeResultDto | null;

  static fromExplain(explain: PriceExplain): PriceExplainResponseDto {
    const dto = new PriceExplainResponseDto();
    dto.kind = explain.kind;
    dto.lastPurchaseUnitCost =
      explain.lastPurchaseUnitCost === null
        ? null
        : UnitCostUtils.format(explain.lastPurchaseUnitCost);
    dto.belowCost = explain.belowCost;
    dto.staffId = explain.staffId;
    dto.staffName = explain.staffName;
    dto.levelName = explain.levelName;
    dto.total = minorToApi(explain.total);
    dto.line = PriceExplainLineDto.fromLine(explain.line);
    dto.candidates = explain.candidates.map(
      PriceExplainCandidateDto.fromCandidate,
    );
    dto.notApplied = explain.notApplied.map(
      PriceExplainNotAppliedDto.fromNotApplied,
    );
    dto.promoCode = PromoCodeResultDto.fromResult(explain.promoCode);
    return dto;
  }
}

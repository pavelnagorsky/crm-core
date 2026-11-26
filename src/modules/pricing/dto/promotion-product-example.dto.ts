import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { ProductUnit } from '../engine/enums/product-unit.enum.js';
import { PromotionProductExample } from '../interfaces/promotion-product-example.interface.js';

/** A product a promotion reaches, for one unit (1 шт / 1 ед.) at the example date. */
export class PromotionProductExampleDto {
  @ApiProperty({ type: String })
  productId: string;

  @ApiProperty({ type: String })
  productName: string;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit: ProductUnit;

  @ApiPrice({ description: 'Retail price of one unit.' })
  before: string;

  @ApiPrice({ description: 'With the discount, rounded down.' })
  after: string;

  @ApiPrice({ description: 'before - after.' })
  amount: string;

  @ApiUnitCost(true)
  lastPurchaseUnitCost: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'after is below the last purchase cost of one unit (computed without Read(INVENTORY) too).',
  })
  belowCost: boolean;

  static fromExample(example: PromotionProductExample): PromotionProductExampleDto {
    const dto = new PromotionProductExampleDto();
    dto.productId = example.productId;
    dto.productName = example.productName;
    dto.unit = example.unit;
    dto.before = MoneyUtils.format(example.before);
    dto.after = MoneyUtils.format(example.after);
    dto.amount = MoneyUtils.format(example.amount);
    dto.lastPurchaseUnitCost =
      example.lastPurchaseUnitCost === null
        ? null
        : UnitCostUtils.format(example.lastPurchaseUnitCost);
    dto.belowCost = example.belowCost;
    return dto;
  }
}

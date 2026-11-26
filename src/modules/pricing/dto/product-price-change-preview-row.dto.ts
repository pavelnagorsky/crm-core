import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus, ProductUnit } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { ProductPriceChangeRow } from '../interfaces/product-price-change-row.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

/** One product of a product price change preview. */
export class ProductPriceChangePreviewRowDto {
  @ApiProperty({ type: String, description: 'PRODUCT:<productId>' })
  key: string;

  @ApiProperty({ type: String, format: 'uuid' })
  productId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  productLocationId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit: ProductUnit;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  categoryId: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryName: string | null;

  @ApiProperty({
    enum: ProductStatus,
    enumName: 'ProductStatus',
    description: 'Status in the location.',
  })
  status: ProductStatus;

  @ApiPrice({ required: true, description: 'Retail price in force on the date.' })
  before: string;

  @ApiPrice({ required: true })
  after: string;

  @ApiProperty({ type: Boolean })
  invalid: boolean;

  @ApiProperty({ type: Boolean })
  checked: boolean;

  @ApiUnitCost(true)
  lastPurchaseUnitCost: string | null;

  @ApiProperty({
    type: Boolean,
    description: '"after" is below the last purchase price; does not block.',
  })
  belowCost: boolean;

  static fromRow(row: ProductPriceChangeRow): ProductPriceChangePreviewRowDto {
    return Object.assign(new ProductPriceChangePreviewRowDto(), {
      key: row.key,
      productId: row.productId,
      productLocationId: row.productLocationId,
      title: row.title,
      sku: row.sku,
      unit: row.unit,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      status: row.status,
      before: minorToApi(row.before),
      after: minorToApi(row.after),
      invalid: row.invalid,
      checked: row.checked,
      lastPurchaseUnitCost:
        row.lastPurchaseUnitCost === null
          ? null
          : UnitCostUtils.format(row.lastPurchaseUnitCost),
      belowCost: row.belowCost,
    });
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeSkip } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ProductPriceChangeItemRow } from '../interfaces/product-price-change-item-row.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

/** One stored row of a product price change. */
export class ProductPriceChangeRowDto {
  @ApiProperty({ type: String, format: 'uuid' })
  itemId: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid', description: 'Null: the product is deleted.' })
  productId: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  productLocationId: string | null;

  @ApiProperty({ type: String, description: 'The name when the change was made.' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryName: string | null;

  @ApiPrice({ required: true })
  before: string;

  @ApiPrice({ required: true })
  after: string;

  @ApiPrice({
    required: false,
    nullable: true,
    description: 'Stored price before the rollback; only in the rollback answer.',
  })
  current?: string | null;

  @ApiProperty({ enum: PriceChangeSkip, enumName: 'PriceChangeSkip', nullable: true })
  applySkip: PriceChangeSkip | null;

  @ApiProperty({ enum: PriceChangeSkip, enumName: 'PriceChangeSkip', nullable: true })
  rollbackSkip: PriceChangeSkip | null;

  @ApiProperty({ type: Boolean })
  rolledBack: boolean;

  static fromRow(row: ProductPriceChangeItemRow): ProductPriceChangeRowDto {
    const dto = Object.assign(new ProductPriceChangeRowDto(), {
      itemId: row.itemId,
      productId: row.productId,
      productLocationId: row.productLocationId,
      title: row.title,
      sku: row.sku,
      categoryName: row.categoryName,
      before: minorToApi(row.before),
      after: minorToApi(row.after),
      applySkip: row.applySkip,
      rollbackSkip: row.rollbackSkip,
      rolledBack: row.rolledBack,
    });
    if (row.current !== undefined)
      dto.current = row.current === null ? null : minorToApi(row.current);
    return dto;
  }
}

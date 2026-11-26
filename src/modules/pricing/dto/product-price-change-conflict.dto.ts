import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeConflict } from '../interfaces/price-change-conflict.interface.js';

/** A scheduled change that shares products with a new one on the same date. */
export class ProductPriceChangeConflictDto {
  @ApiProperty({ type: String, format: 'uuid' })
  changeId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, example: '2027-01-01' })
  effectiveDate: string;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Products both changes touch (Product.id).',
  })
  productIds: string[];

  static fromConflict(conflict: PriceChangeConflict): ProductPriceChangeConflictDto {
    return Object.assign(new ProductPriceChangeConflictDto(), {
      changeId: conflict.changeId,
      title: conflict.title,
      effectiveDate: conflict.effectiveDate,
      productIds: conflict.productIds,
    });
  }
}

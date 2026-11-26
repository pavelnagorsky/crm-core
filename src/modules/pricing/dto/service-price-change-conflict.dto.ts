import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeConflict } from '../interfaces/price-change-conflict.interface.js';

/** A scheduled change that shares services or bundles with a new one on the same date. */
export class ServicePriceChangeConflictDto {
  @ApiProperty({ type: String, format: 'uuid' })
  changeId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, example: '2027-01-01' })
  effectiveDate: string;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Services both changes touch.',
  })
  serviceIds: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Bundles both changes touch.',
  })
  bundleIds: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Products both changes touch (Product.id); empty for services.',
  })
  productIds: string[];

  static fromConflict(
    conflict: PriceChangeConflict,
  ): ServicePriceChangeConflictDto {
    return Object.assign(new ServicePriceChangeConflictDto(), conflict);
  }
}

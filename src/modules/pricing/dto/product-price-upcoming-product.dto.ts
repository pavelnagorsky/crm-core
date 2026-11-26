import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';

/** The nearest scheduled retail price of a product. */
export class ProductPriceUpcomingProductDto {
  @ApiProperty({ type: String, format: 'uuid' })
  productId: string;

  @ApiProperty({ type: String, example: '2027-01-01' })
  effectiveDate: string;

  @ApiPrice({ required: true })
  price: string;

  @ApiProperty({ type: String, format: 'uuid' })
  changeId: string;
}

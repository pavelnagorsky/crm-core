import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';

export class ServicePriceUpcomingBundleDto {
  @ApiProperty({ type: String, format: 'uuid' })
  bundleId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  changeId: string;

  @ApiProperty({ type: String, example: '2027-01-01' })
  effectiveDate: string;

  @ApiPrice()
  price: string;
}

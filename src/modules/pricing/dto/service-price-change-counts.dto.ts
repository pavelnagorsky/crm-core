import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeCounts } from '../interfaces/price-change-counts.interface.js';

export class ServicePriceChangeCountsDto {
  @ApiProperty({ type: Number })
  services: number;

  @ApiProperty({ type: Number })
  bundles: number;

  @ApiProperty({ type: Number })
  rows: number;

  @ApiProperty({
    type: Number,
    description: 'Valid rows that change the price.',
  })
  changed: number;

  @ApiProperty({ type: Number })
  invalid: number;

  static fromCounts(counts: PriceChangeCounts): ServicePriceChangeCountsDto {
    return Object.assign(new ServicePriceChangeCountsDto(), counts);
  }
}

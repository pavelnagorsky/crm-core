import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceImportCounts } from '../interfaces/service-price-import-counts.interface.js';

export class ServicePriceImportCountsDto {
  @ApiProperty({ type: Number })
  newServices: number;

  @ApiProperty({ type: Number })
  newCategories: number;

  @ApiProperty({ type: Number, description: 'Services with changed prices.' })
  services: number;

  @ApiProperty({ type: Number, description: 'Bundles with changed prices.' })
  bundles: number;

  @ApiProperty({ type: Number, description: 'Changed prices.' })
  rows: number;

  static fromCounts(
    counts: ServicePriceImportCounts,
  ): ServicePriceImportCountsDto {
    return Object.assign(new ServicePriceImportCountsDto(), counts);
  }
}

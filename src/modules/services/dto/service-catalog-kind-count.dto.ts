import { ApiProperty } from '@nestjs/swagger';
import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';

export class ServiceCatalogKindCountDto {
  @ApiProperty({ enum: ServiceCatalogKind, enumName: 'ServiceCatalogKind' })
  kind: ServiceCatalogKind;

  @ApiProperty({ type: Number })
  count: number;
}

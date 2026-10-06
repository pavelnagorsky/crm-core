import { ApiProperty } from '@nestjs/swagger';
import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';
import { ServiceCatalogServiceItem } from '../interfaces/service-catalog-service-item.interface.js';
import { ServiceCatalogItemBaseDto } from './service-catalog-item-base.dto.js';

export class ServiceCatalogServiceItemDto extends ServiceCatalogItemBaseDto {
  @ApiProperty({ enum: [ServiceCatalogKind.SERVICE] })
  declare kind: ServiceCatalogKind.SERVICE;

  @ApiProperty({ type: Number })
  bufferMinutes: number;

  @ApiProperty({ type: Boolean })
  hasNoStaff: boolean;

  static fromEntity(
    item: ServiceCatalogServiceItem,
  ): ServiceCatalogServiceItemDto {
    const dto = new ServiceCatalogServiceItemDto();
    ServiceCatalogItemBaseDto.assign(dto, item);
    dto.bufferMinutes = item.bufferMinutes;
    dto.hasNoStaff = item.hasNoStaff;
    return dto;
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { ServiceCatalogBundleServiceItem } from '../interfaces/service-catalog-bundle-service-item.interface.js';

export class ServiceCatalogBundleServiceItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiProperty({ type: Number })
  sortOrder: number;

  static fromEntity(
    item: ServiceCatalogBundleServiceItem,
  ): ServiceCatalogBundleServiceItemDto {
    const dto = new ServiceCatalogBundleServiceItemDto();
    dto.serviceId = item.serviceId;
    dto.serviceTitle = item.serviceTitle;
    dto.sortOrder = item.sortOrder;
    return dto;
  }
}

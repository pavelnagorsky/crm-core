import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';
import { ServiceCatalogItem } from '../interfaces/service-catalog-item.js';
import { ServiceCatalogBundleItemDto } from './service-catalog-bundle-item.dto.js';
import { ServiceCatalogServiceItemDto } from './service-catalog-service-item.dto.js';

export class ServiceCatalogItemDto {
  static fromEntity(item: ServiceCatalogItem): ServiceCatalogServiceItemDto | ServiceCatalogBundleItemDto {
    if (item.kind === ServiceCatalogKind.SERVICE) return ServiceCatalogServiceItemDto.fromEntity(item);
    return ServiceCatalogBundleItemDto.fromEntity(item);
  }
}

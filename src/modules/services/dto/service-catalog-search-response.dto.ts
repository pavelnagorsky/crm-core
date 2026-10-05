import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { ServiceCatalogBundleItemDto } from './service-catalog-bundle-item.dto.js';
import { ServiceCatalogServiceItemDto } from './service-catalog-service-item.dto.js';

@ApiExtraModels(ServiceCatalogServiceItemDto, ServiceCatalogBundleItemDto)
export class ServiceCatalogSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(ServiceCatalogServiceItemDto) },
        { $ref: getSchemaPath(ServiceCatalogBundleItemDto) },
      ],
      discriminator: {
        propertyName: 'kind',
        mapping: {
          SERVICE: getSchemaPath(ServiceCatalogServiceItemDto),
          BUNDLE: getSchemaPath(ServiceCatalogBundleItemDto),
        },
      },
    },
  })
  items: Array<ServiceCatalogServiceItemDto | ServiceCatalogBundleItemDto>;

  constructor(
    items: Array<ServiceCatalogServiceItemDto | ServiceCatalogBundleItemDto>,
    page: number,
    pageSize: number,
    totalItems: number,
    isExport: boolean = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

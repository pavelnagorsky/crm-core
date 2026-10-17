import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Permission } from '../../../access/enums/permission.enum.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { ServiceBundleResponseDto } from '../dto/service-bundle-response.dto.js';
import { ServiceCatalogCountsRequestDto } from '../dto/service-catalog-counts-request.dto.js';
import { ServiceCatalogCountsResponseDto } from '../dto/service-catalog-counts-response.dto.js';
import { ServiceCatalogItemDto } from '../dto/service-catalog-item.dto.js';
import { ServiceCatalogSearchRequestDto } from '../dto/service-catalog-search-request.dto.js';
import { ServiceCatalogSearchResponseDto } from '../dto/service-catalog-search-response.dto.js';
import { ServiceResponseDto } from '../dto/service-response.dto.js';
import { ServiceCatalogFacade } from '../service-catalog.facade.js';

@ApiTags('Services')
@Controller('locations/:locationId')
export class ServiceCatalogController {
  constructor(private readonly serviceCatalog: ServiceCatalogFacade) {}

  @ApiOperation({ summary: 'Get unified service catalog counts' })
  @ApiOkResponse({ type: ApiResponse(ServiceCatalogCountsResponseDto) })
  @Permissions(Permission.SERVICE_READ)
  @Get('service-catalog/counts')
  async getCatalogCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: ServiceCatalogCountsRequestDto,
  ): Promise<BaseResponseDto<ServiceCatalogCountsResponseDto>> {
    const counts = await this.serviceCatalog.getCounts(locationId, dto);
    return BaseResponseDto.success(
      ServiceCatalogCountsResponseDto.fromCounts(counts),
    );
  }

  @ApiOperation({ summary: 'Search the unified service catalog' })
  @ApiOkResponse({ type: ApiResponse(ServiceCatalogSearchResponseDto) })
  @Permissions(Permission.SERVICE_READ)
  @Get('service-catalog')
  async searchCatalog(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: ServiceCatalogSearchRequestDto,
  ): Promise<BaseResponseDto<ServiceCatalogSearchResponseDto>> {
    const { items, totalItems } = await this.serviceCatalog.search(
      locationId,
      dto,
    );
    return BaseResponseDto.success(
      new ServiceCatalogSearchResponseDto(
        items.map(ServiceCatalogItemDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get service by ID' })
  @ApiOkResponse({ type: ApiResponse(ServiceResponseDto) })
  @ApiNotFoundResponse({ description: 'Service not found' })
  @Permissions(Permission.SERVICE_READ)
  @Get('services/:id')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<ServiceResponseDto>> {
    const service = await this.serviceCatalog.findServiceById(locationId, id);
    return BaseResponseDto.success(ServiceResponseDto.fromEntity(service));
  }

  @ApiOperation({ summary: 'Get service bundle by ID' })
  @ApiOkResponse({ type: ApiResponse(ServiceBundleResponseDto) })
  @ApiNotFoundResponse({ description: 'Service bundle not found' })
  @Permissions(Permission.SERVICE_READ)
  @Get('service-bundles/:id')
  async findBundleById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<ServiceBundleResponseDto>> {
    const bundle = await this.serviceCatalog.findBundleById(locationId, id);
    return BaseResponseDto.success(ServiceBundleResponseDto.fromEntity(bundle));
  }
}

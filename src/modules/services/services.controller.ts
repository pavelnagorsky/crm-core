import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { ServicesService } from './services.service.js';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto.js';
import { UpdateServiceCategoryDto } from './dto/update-service-category.dto.js';
import { ServiceCategoryResponseDto } from './dto/service-category-response.dto.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { UpdateServiceStatusDto } from './dto/update-service-status.dto.js';
import { ServiceResponseDto } from './dto/service-response.dto.js';
import { CreateServiceBundleDto } from './dto/create-service-bundle.dto.js';
import { UpdateServiceBundleDto } from './dto/update-service-bundle.dto.js';
import { ServiceBundleResponseDto } from './dto/service-bundle-response.dto.js';
import { LocationRBAC } from '../auth/decorators/location-rbac.decorator.js';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { ServiceBundleService } from './service-bundle.service.js';
import { ServiceCatalogService } from './service-catalog.service.js';
import { ServiceCatalogSearchRequestDto } from './dto/service-catalog-search-request.dto.js';
import { ServiceCatalogSearchResponseDto } from './dto/service-catalog-search-response.dto.js';
import { ServiceCatalogItemDto } from './dto/service-catalog-item.dto.js';
import { ServiceCatalogCountsRequestDto } from './dto/service-catalog-counts-request.dto.js';
import { ServiceCatalogCountsResponseDto } from './dto/service-catalog-counts-response.dto.js';

@ApiTags('Services')
@Controller('locations/:locationId')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly serviceBundles: ServiceBundleService,
    private readonly serviceCatalog: ServiceCatalogService,
  ) {}

  // ─── Service Categories ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a service category' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @LocationRBAC(BusinessRole.OWNER)
  @Post('service-categories')
  async createCategory(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateServiceCategoryDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const category = await this.servicesService.createCategory(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: category.id });
  }

  @ApiOperation({ summary: 'List service categories for a business' })
  @ApiOkResponse({ type: ApiResponseArray(ServiceCategoryResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('service-categories')
  async listCategories(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<ServiceCategoryResponseDto[]>> {
    const categories = await this.servicesService.listCategories(locationId);
    return BaseResponseDto.success(
      categories.map(ServiceCategoryResponseDto.fromEntity),
    );
  }

  @ApiOperation({ summary: 'Update a service category' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Service category not found' })
  @ApiConflictResponse({ description: 'Category name already exists' })
  @LocationRBAC(BusinessRole.OWNER)
  @Put('service-categories/:categoryId')
  async updateCategory(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateServiceCategoryDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const category = await this.servicesService.updateCategory(
      locationId,
      categoryId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: category.id });
  }

  @ApiOperation({ summary: 'Delete a service category' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service category not found' })
  @LocationRBAC(BusinessRole.OWNER)
  @Delete('service-categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.servicesService.deleteCategory(
      locationId,
      categoryId,
      auditActorFromToken(tokenPayload, locationId),
    );
  }

  // ─── Services ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a service' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @LocationRBAC(BusinessRole.OWNER)
  @Post('services')
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateServiceDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const service = await this.servicesService.create(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: service.id });
  }

  @ApiOperation({ summary: 'Update a service' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Service not found' })
  @LocationRBAC(BusinessRole.OWNER)
  @Put('services/:id')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const service = await this.servicesService.update(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: service.id });
  }

  // ─── Service catalog ─────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get unified service catalog counts' })
  @ApiOkResponse({ type: ApiResponse(ServiceCatalogCountsResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.STAFF)
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
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.STAFF)
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

  @ApiOperation({ summary: 'Create a service bundle' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @LocationRBAC(BusinessRole.OWNER)
  @Post('service-bundles')
  async createBundle(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateServiceBundleDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const bundle = await this.serviceBundles.create(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: bundle.id });
  }

  @ApiOperation({ summary: 'Get service bundle by ID' })
  @ApiOkResponse({ type: ApiResponse(ServiceBundleResponseDto) })
  @ApiNotFoundResponse({ description: 'Service bundle not found' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('service-bundles/:id')
  async findBundleById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<ServiceBundleResponseDto>> {
    const bundle = await this.serviceBundles.findById(id);
    return BaseResponseDto.success(ServiceBundleResponseDto.fromEntity(bundle));
  }

  @ApiOperation({ summary: 'Update a service bundle' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Service bundle not found' })
  @LocationRBAC(BusinessRole.OWNER)
  @Put('service-bundles/:id')
  async updateBundle(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceBundleDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const bundle = await this.serviceBundles.update(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: bundle.id });
  }

  @ApiOperation({ summary: 'Change service bundle status' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service bundle not found' })
  @ApiConflictResponse({ description: 'Bundle already has this status' })
  @LocationRBAC(BusinessRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('service-bundles/:id/status')
  async updateBundleStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.serviceBundles.changeStatus(
      locationId,
      id,
      dto.status,
      auditActorFromToken(tokenPayload, locationId),
    );
  }

  @ApiOperation({ summary: 'Delete a service bundle' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service bundle not found' })
  @ApiConflictResponse({ description: 'Bundle is used in bookings' })
  @LocationRBAC(BusinessRole.OWNER)
  @Delete('service-bundles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBundle(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.serviceBundles.delete(
      locationId,
      id,
      auditActorFromToken(tokenPayload, locationId),
    );
  }

  @ApiOperation({ summary: 'Get service by ID' })
  @ApiOkResponse({ type: ApiResponse(ServiceResponseDto) })
  @ApiNotFoundResponse({ description: 'Service not found' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('services/:id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<ServiceResponseDto>> {
    const service = await this.servicesService.findById(id);
    return BaseResponseDto.success(ServiceResponseDto.fromEntity(service));
  }

  @ApiOperation({ summary: 'Change service status' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service not found' })
  @ApiConflictResponse({ description: 'Service already has this status' })
  @LocationRBAC(BusinessRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('services/:id/status')
  async updateStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.servicesService.changeStatus(
      locationId,
      id,
      dto.status,
      auditActorFromToken(tokenPayload, locationId),
    );
  }

  @ApiOperation({ summary: 'Delete a service' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service not found' })
  @ApiConflictResponse({
    description: 'Service is used in bookings or compensation plans',
  })
  @LocationRBAC(BusinessRole.OWNER)
  @Delete('services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.servicesService.delete(
      locationId,
      id,
      auditActorFromToken(tokenPayload, locationId),
    );
  }
}

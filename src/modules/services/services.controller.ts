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
import { ServiceCategoryResponseDto } from './dto/service-category-response.dto.js';
import { PublicServiceCategoryDto } from './dto/public-service-category.dto.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { UpdateServiceStatusDto } from './dto/update-service-status.dto.js';
import { ServiceResponseDto } from './dto/service-response.dto.js';
import { ServiceSearchRequestDto } from './dto/service-search-request.dto.js';
import { ServiceSearchResponseDto } from './dto/service-search-response.dto.js';
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { ApiResponse, ApiResponseArray, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/interfaces/audit-actor-from-token.js';

@ApiTags('Services')
@Controller('businesses/:businessId')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // ─── Public ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List active services grouped by category (public)' })
  @ApiOkResponse({ type: ApiResponseArray(PublicServiceCategoryDto) })
  @Get('public/services')
  async listPublicServices(
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<BaseResponseDto<PublicServiceCategoryDto[]>> {
    const categories = await this.servicesService.listGroupedByCategory(businessId);
    return BaseResponseDto.success(categories);
  }

  // ─── Service Categories ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a service category' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Post('service-categories')
  async createCategory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateServiceCategoryDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const category = await this.servicesService.createCategory(businessId, dto);
    return BaseResponseDto.success({ id: category.id });
  }

  @ApiOperation({ summary: 'List service categories for a business' })
  @ApiOkResponse({ type: ApiResponseArray(ServiceCategoryResponseDto) })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('service-categories')
  async listCategories(
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<BaseResponseDto<ServiceCategoryResponseDto[]>> {
    const categories = await this.servicesService.listCategories(businessId);
    return BaseResponseDto.success(categories.map(ServiceCategoryResponseDto.fromEntity));
  }

  @ApiOperation({ summary: 'Delete a service category' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service category not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete('service-categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<void> {
    await this.servicesService.deleteCategory(categoryId);
  }

  // ─── Services ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a service' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Post('services')
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateServiceDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const service = await this.servicesService.create(businessId, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: service.id });
  }

  @ApiOperation({ summary: 'Update a service' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Service not found' })
  @RBAC(BusinessRole.OWNER)
  @Put('services/:id')
  async update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const service = await this.servicesService.update(businessId, id, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: service.id });
  }

  @ApiOperation({ summary: 'Search services' })
  @ApiOkResponse({ type: ApiResponse(ServiceSearchResponseDto) })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('services')
  async search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: ServiceSearchRequestDto,
  ): Promise<BaseResponseDto<ServiceSearchResponseDto>> {
    const { items, totalItems } = await this.servicesService.search(businessId, dto);
    return BaseResponseDto.success(
      new ServiceSearchResponseDto(
        items.map(ServiceResponseDto.fromEntity),
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
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('services/:id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<ServiceResponseDto>> {
    const service = await this.servicesService.findById(id);
    return BaseResponseDto.success(ServiceResponseDto.fromEntity(service));
  }

  @ApiOperation({ summary: 'Update service active status' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service not found' })
  @RBAC(BusinessRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('services/:id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceStatusDto,
  ): Promise<void> {
    await this.servicesService.setActive(id, dto.isActive);
  }

  @ApiOperation({ summary: 'Delete a service' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete('services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.servicesService.delete(businessId, id, auditActorFromToken(tokenPayload, businessId));
  }
}

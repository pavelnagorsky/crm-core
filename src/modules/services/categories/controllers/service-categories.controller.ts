import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { Claim } from '../../../access/enums/claim.enum.js';
import { Read, Write } from '../../../access/utils/permission.js';
import { ApiResponseArray } from '../../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../../shared/dto/id-response.dto.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { CreateServiceCategoryDto } from '../dto/create-service-category.dto.js';
import { ServiceCategoryResponseDto } from '../dto/service-category-response.dto.js';
import { UpdateServiceCategoryDto } from '../dto/update-service-category.dto.js';
import { ServiceCategoriesService } from '../services/service-categories.service.js';

@ApiTags('Services')
@Controller('locations/:locationId')
export class ServiceCategoriesController {
  constructor(private readonly categories: ServiceCategoriesService) {}

  @ApiOperation({ summary: 'Create a service category' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Write(Claim.SERVICE))
  @Post('service-categories')
  async createCategory(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateServiceCategoryDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const category = await this.categories.createCategory(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: category.id });
  }

  @ApiOperation({ summary: 'List service categories for a business' })
  @ApiOkResponse({ type: ApiResponseArray(ServiceCategoryResponseDto) })
  @Permissions(Read(Claim.SERVICE))
  @Get('service-categories')
  async listCategories(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<ServiceCategoryResponseDto[]>> {
    const categories = await this.categories.listCategories(locationId);
    return BaseResponseDto.success(
      categories.map(ServiceCategoryResponseDto.fromEntity),
    );
  }

  @ApiOperation({ summary: 'Update a service category' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Service category not found' })
  @ApiConflictResponse({ description: 'Category name already exists' })
  @Permissions(Write(Claim.SERVICE))
  @Put('service-categories/:categoryId')
  async updateCategory(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateServiceCategoryDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const category = await this.categories.updateCategory(
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
  @Permissions(Write(Claim.SERVICE))
  @Delete('service-categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.categories.deleteCategory(
      locationId,
      categoryId,
      auditActorFromToken(tokenPayload, locationId),
    );
  }
}

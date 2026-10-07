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
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { BrandRBAC } from '../auth/decorators/brand-rbac.decorator.js';
import { LocationRBAC } from '../auth/decorators/location-rbac.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { CreateProductCategoryDto } from './dto/create-product-category.dto.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { LocationProductResponseDto } from './dto/location-product-response.dto.js';
import { LocationProductSearchRequestDto } from './dto/location-product-search-request.dto.js';
import { LocationProductSearchResponseDto } from './dto/location-product-search-response.dto.js';
import { ProductCategoryResponseDto } from './dto/product-category-response.dto.js';
import { ProductResponseDto } from './dto/product-response.dto.js';
import { ProductSearchRequestDto } from './dto/product-search-request.dto.js';
import { ProductSearchResponseDto } from './dto/product-search-response.dto.js';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { UpdateProductStatusDto } from './dto/update-product-status.dto.js';
import { UpsertProductLocationDto } from './dto/upsert-product-location.dto.js';
import { ProductLocationResponseDto } from './dto/product-location-response.dto.js';
import { ProductsService } from './products.service.js';

@ApiTags('Products')
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @ApiOperation({ summary: 'Create a product category' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @BrandRBAC(BusinessRole.OWNER)
  @Post('brands/:brandId/product-categories')
  async createCategory(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateProductCategoryDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const category = await this.products.createCategory(
      brandId,
      dto,
      auditActorFromToken(token, brandId),
    );
    return BaseResponseDto.success({ id: category.id });
  }

  @ApiOperation({ summary: 'List product categories' })
  @ApiOkResponse({ type: ApiResponseArray(ProductCategoryResponseDto) })
  @BrandRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get('brands/:brandId/product-categories')
  async listCategories(
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<BaseResponseDto<ProductCategoryResponseDto[]>> {
    const rows = await this.products.listCategories(brandId);
    return BaseResponseDto.success(
      rows.map(ProductCategoryResponseDto.fromEntity),
    );
  }

  @ApiOperation({ summary: 'Update a product category' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Category name already exists' })
  @BrandRBAC(BusinessRole.OWNER)
  @Put('brands/:brandId/product-categories/:categoryId')
  async updateCategory(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateProductCategoryDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const category = await this.products.updateCategory(
      brandId,
      categoryId,
      dto,
      auditActorFromToken(token, brandId),
    );
    return BaseResponseDto.success({ id: category.id });
  }

  @ApiOperation({ summary: 'Delete a product category' })
  @ApiNoContentResponse()
  @BrandRBAC(BusinessRole.OWNER)
  @Delete('brands/:brandId/product-categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<void> {
    await this.products.deleteCategory(
      brandId,
      categoryId,
      auditActorFromToken(token, brandId),
    );
  }

  @ApiOperation({ summary: 'Create a product' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'SKU or barcode already exists' })
  @BrandRBAC(BusinessRole.OWNER)
  @Post('brands/:brandId/products')
  async create(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateProductDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const product = await this.products.create(
      brandId,
      dto,
      auditActorFromToken(token, brandId),
    );
    return BaseResponseDto.success({ id: product.id });
  }

  @ApiOperation({ summary: 'Search brand products' })
  @ApiOkResponse({ type: ApiResponse(ProductSearchResponseDto) })
  @BrandRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get('brands/:brandId/products')
  async search(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: ProductSearchRequestDto,
  ): Promise<BaseResponseDto<ProductSearchResponseDto>> {
    const { items, totalItems } = await this.products.search(brandId, dto);
    return BaseResponseDto.success(
      new ProductSearchResponseDto(
        items.map(ProductResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get product details' })
  @ApiOkResponse({ type: ApiResponse(ProductResponseDto) })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @BrandRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get('brands/:brandId/products/:productId')
  async findById(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<BaseResponseDto<ProductResponseDto>> {
    return BaseResponseDto.success(
      ProductResponseDto.fromEntity(
        await this.products.findByIdInBrand(brandId, productId),
      ),
    );
  }

  @ApiOperation({ summary: 'Update a product' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @BrandRBAC(BusinessRole.OWNER)
  @Put('brands/:brandId/products/:productId')
  async update(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const product = await this.products.update(
      brandId,
      productId,
      dto,
      auditActorFromToken(token, brandId),
    );
    return BaseResponseDto.success({ id: product.id });
  }

  @ApiOperation({ summary: 'Change product status' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @BrandRBAC(BusinessRole.OWNER)
  @Patch('brands/:brandId/products/:productId/status')
  async changeStatus(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductStatusDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const product = await this.products.changeStatus(
      brandId,
      productId,
      dto.status,
      auditActorFromToken(token, brandId),
    );
    return BaseResponseDto.success({ id: product.id });
  }

  @ApiOperation({ summary: 'Delete an unused product' })
  @ApiNoContentResponse()
  @BrandRBAC(BusinessRole.OWNER)
  @Delete('brands/:brandId/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<void> {
    await this.products.delete(
      brandId,
      productId,
      auditActorFromToken(token, brandId),
    );
  }

  @ApiOperation({
    summary: 'Create or replace product settings for a location',
  })
  @ApiOkResponse({ type: ApiResponse(ProductLocationResponseDto) })
  @LocationRBAC(BusinessRole.OWNER)
  @Put('locations/:locationId/products/:productId')
  async upsertLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpsertProductLocationDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductLocationResponseDto>> {
    const row = await this.products.upsertLocation(
      locationId,
      productId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(ProductLocationResponseDto.fromEntity(row));
  }

  @ApiOperation({ summary: 'Search products enabled for a location' })
  @ApiOkResponse({ type: ApiResponse(LocationProductSearchResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get('locations/:locationId/products')
  async searchLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: LocationProductSearchRequestDto,
  ): Promise<BaseResponseDto<LocationProductSearchResponseDto>> {
    const { items, totalItems } = await this.products.searchLocation(
      locationId,
      dto,
    );
    return BaseResponseDto.success(
      new LocationProductSearchResponseDto(
        items.map(LocationProductResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }
}

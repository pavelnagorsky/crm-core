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
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { CreateProductCategoryDto } from '../dto/create-product-category.dto.js';
import { CreateProductDto } from '../dto/create-product.dto.js';
import { LocationProductResponseDto } from '../dto/location-product-response.dto.js';
import { LocationProductSearchRequestDto } from '../dto/location-product-search-request.dto.js';
import { LocationProductSearchResponseDto } from '../dto/location-product-search-response.dto.js';
import { ProductCategoryResponseDto } from '../dto/product-category-response.dto.js';
import { ProductResponseDto } from '../dto/product-response.dto.js';
import { ProductSearchRequestDto } from '../dto/product-search-request.dto.js';
import { ProductSearchResponseDto } from '../dto/product-search-response.dto.js';
import { ProductStatusCountResponseDto } from '../dto/product-status-count-response.dto.js';
import { ProductStatusCountsRequestDto } from '../dto/product-status-counts-request.dto.js';
import { UpdateProductCategoryDto } from '../dto/update-product-category.dto.js';
import { UpdateProductStatusDto } from '../dto/update-product-status.dto.js';
import { UpdateProductDto } from '../dto/update-product.dto.js';
import { UpsertProductLocationDto } from '../dto/upsert-product-location.dto.js';
import { ProductsService } from '../services/products.service.js';

@ApiTags('Products')
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @ApiOperation({ summary: 'Create a product category' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.PRODUCT_CATALOG_MANAGE)
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
  @Permissions(Permission.PRODUCT_READ)
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
  @Permissions(Permission.PRODUCT_CATALOG_MANAGE)
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
  @Permissions(Permission.PRODUCT_CATALOG_MANAGE)
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
  @Permissions(Permission.PRODUCT_CATALOG_MANAGE)
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
  @Permissions(Permission.PRODUCT_READ)
  @Get('brands/:brandId/products')
  async search(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: ProductSearchRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductSearchResponseDto>> {
    const { items, totalItems } = await this.products.search(brandId, dto);
    return BaseResponseDto.success(
      new ProductSearchResponseDto(
        items.map((item) =>
          ProductResponseDto.fromEntity({
            ...item,
            locations: item.locations.filter((location) =>
              hasPermission(
                token,
                Permission.PRODUCT_LOCATION_READ,
                location.locationId,
              ),
            ),
          }),
        ),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get product count per status' })
  @ApiOkResponse({ type: ApiResponseArray(ProductStatusCountResponseDto) })
  @Permissions(Permission.PRODUCT_READ)
  @Get('brands/:brandId/products/status-counts')
  async getStatusCounts(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: ProductStatusCountsRequestDto,
  ): Promise<BaseResponseDto<ProductStatusCountResponseDto[]>> {
    const counts = await this.products.getStatusCounts(brandId, dto);
    return BaseResponseDto.success(
      counts.map((row) =>
        Object.assign(new ProductStatusCountResponseDto(), row),
      ),
    );
  }

  @ApiOperation({ summary: 'Get product details' })
  @ApiOkResponse({ type: ApiResponse(ProductResponseDto) })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @Permissions(Permission.PRODUCT_READ)
  @Get('brands/:brandId/products/:productId')
  async findById(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductResponseDto>> {
    const product = await this.products.findByIdInBrand(brandId, productId);
    return BaseResponseDto.success(
      ProductResponseDto.fromEntity({
        ...product,
        locations: product.locations.filter((location) =>
          hasPermission(
            token,
            Permission.PRODUCT_LOCATION_READ,
            location.locationId,
          ),
        ),
      }),
    );
  }

  @ApiOperation({ summary: 'Update a product' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.PRODUCT_CATALOG_MANAGE)
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
  @Permissions(Permission.PRODUCT_CATALOG_MANAGE)
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
  @Permissions(Permission.PRODUCT_CATALOG_MANAGE)
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
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.PRODUCT_LOCATION_MANAGE)
  @Put('locations/:locationId/products/:productId')
  async upsertLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpsertProductLocationDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const row = await this.products.upsertLocation(
      locationId,
      productId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: row.id });
  }

  @ApiOperation({ summary: 'Search products enabled for a location' })
  @ApiOkResponse({ type: ApiResponse(LocationProductSearchResponseDto) })
  @Permissions(Permission.PRODUCT_LOCATION_READ)
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

import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { CreateProductPackagingDto } from './dto/create-product-packaging.dto.js';
import { ProductPackagingResponseDto } from './dto/product-packaging-response.dto.js';
import { UpdateProductPackagingStatusDto } from './dto/update-product-packaging-status.dto.js';
import { ProductPackagingService } from './services/product-packaging.service.js';
import { Permission } from '../access/enums/permission.enum.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';

@ApiTags('Products')
@Controller('brands/:brandId/products/:productId/packagings')
export class ProductPackagingController {
  constructor(private readonly packagings: ProductPackagingService) {}

  @Post()
  @Permissions(Permission.PRODUCT_PACKAGING_MANAGE)
  @ApiOperation({
    summary:
      'Create an immutable product packaging; packagings are included in product details',
  })
  @ApiCreatedResponse({ type: ApiResponse(ProductPackagingResponseDto) })
  async create(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductPackagingDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductPackagingResponseDto>> {
    const packaging = await this.packagings.create(
      brandId,
      productId,
      dto,
      auditActorFromToken(token, brandId),
    );
    return BaseResponseDto.success(
      ProductPackagingResponseDto.fromEntity(packaging),
    );
  }

  @Patch(':packagingId/status')
  @Permissions(Permission.PRODUCT_PACKAGING_MANAGE)
  @ApiOperation({ summary: 'Archive or reactivate a product packaging' })
  @ApiOkResponse({ type: ApiResponse(ProductPackagingResponseDto) })
  async changeStatus(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('packagingId', ParseUUIDPipe) packagingId: string,
    @Body() dto: UpdateProductPackagingStatusDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductPackagingResponseDto>> {
    const packaging = await this.packagings.changeStatus(
      brandId,
      productId,
      packagingId,
      dto.isActive,
      auditActorFromToken(token, brandId),
    );
    return BaseResponseDto.success(
      ProductPackagingResponseDto.fromEntity(packaging),
    );
  }
}

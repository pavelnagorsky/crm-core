import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PRICE_CHANGE_MAX_PAGE_SIZE } from '../constants/price-change.constants.js';
import { CreateProductPriceChangeDto } from '../dto/create-product-price-change.dto.js';
import { ProductPriceChangeDetailDto } from '../dto/product-price-change-detail.dto.js';
import { ProductPriceChangeListResponseDto } from '../dto/product-price-change-list-response.dto.js';
import { ProductPriceChangePreviewResponseDto } from '../dto/product-price-change-preview-response.dto.js';
import { ProductPriceChangeRollbackResponseDto } from '../dto/product-price-change-rollback-response.dto.js';
import { ProductPriceChangeSpecDto } from '../dto/product-price-change-spec.dto.js';
import { ProductPriceChangeSummaryDto } from '../dto/product-price-change-summary.dto.js';
import { ProductPriceUpcomingDto } from '../dto/product-price-upcoming.dto.js';
import { ServicePriceChangeListRequestDto } from '../dto/service-price-change-list-request.dto.js';
import { ProductPriceChangePreviewService } from '../services/product-price-change-preview.service.js';
import { ProductPriceChangeReadService } from '../services/product-price-change-read.service.js';
import { ProductPriceChangesService } from '../services/product-price-changes.service.js';

/** Product retail price changes by a rule: preview, create, history, cancel, rollback. */
@ApiTags('Pricing')
@Controller('locations/:locationId/product-price-changes')
export class ProductPriceChangesController {
  constructor(
    private readonly previews: ProductPriceChangePreviewService,
    private readonly changes: ProductPriceChangesService,
    private readonly reads: ProductPriceChangeReadService,
  ) {}

  @ApiOperation({
    summary: 'Preview a product price change rule: the retail price of each product now and after',
  })
  @ApiOkResponse({ type: ApiResponse(ProductPriceChangePreviewResponseDto) })
  @ApiBadRequestResponse({
    description:
      'PRICE_CHANGE_INVALID { field }, PRICE_CHANGE_DATE_INVALID or PRICE_CHANGE_TOO_LARGE',
  })
  @Permissions(Read(Claim.PRICING))
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ProductPriceChangeSpecDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductPriceChangePreviewResponseDto>> {
    return BaseResponseDto.success(
      ProductPriceChangePreviewResponseDto.fromPreview(
        await this.previews.preview(
          locationId,
          dto,
          hasPermission(token, Read(Claim.INVENTORY), locationId),
        ),
      ),
    );
  }

  @ApiOperation({
    summary: 'Create a product price change: apply now, or schedule from a date',
  })
  @ApiOkResponse({ type: ApiResponse(ProductPriceChangeDetailDto) })
  @ApiBadRequestResponse({
    description:
      'PRICE_CHANGE_INVALID, DATE_INVALID, TOO_LARGE, ROW_INVALID or EMPTY',
  })
  @ApiConflictResponse({
    description:
      'PRICE_CHANGE_STALE, PRICE_CHANGE_DATE_CONFLICT { changeId, title, effectiveDate, serviceIds, bundleIds, productIds } or PRICE_CHANGE_LIMIT',
  })
  @Permissions(Write(Claim.PRICING))
  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateProductPriceChangeDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductPriceChangeDetailDto>> {
    return BaseResponseDto.success(
      ProductPriceChangeDetailDto.fromDetail(
        await this.changes.create(
          locationId,
          dto,
          auditActorFromToken(tokenPayload, locationId),
        ),
      ),
    );
  }

  @ApiOperation({
    summary: 'Nearest scheduled date and the scheduled retail prices, for hints',
  })
  @ApiOkResponse({ type: ApiResponse(ProductPriceUpcomingDto) })
  @Permissions([Read(Claim.PRODUCT_CATALOG), Read(Claim.PRODUCT_LOCATION)])
  @Get('upcoming')
  async upcoming(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<ProductPriceUpcomingDto>> {
    return BaseResponseDto.success(
      ProductPriceUpcomingDto.fromView(await this.reads.upcoming(locationId)),
    );
  }

  @ApiOperation({ summary: 'History of product price changes, scheduled ones first' })
  @ApiOkResponse({ type: ApiResponse(ProductPriceChangeListResponseDto) })
  @Permissions(Read(Claim.PRICING))
  @Get()
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: ServicePriceChangeListRequestDto,
  ): Promise<BaseResponseDto<ProductPriceChangeListResponseDto>> {
    const { items, totalItems, counts } = await this.reads.list(locationId, dto);
    return BaseResponseDto.success(
      new ProductPriceChangeListResponseDto(
        items.map(ProductPriceChangeSummaryDto.fromView),
        dto.page,
        Math.min(dto.pageSize, PRICE_CHANGE_MAX_PAGE_SIZE),
        totalItems,
        counts,
      ),
    );
  }

  @ApiOperation({ summary: 'One product price change with its rows' })
  @ApiOkResponse({ type: ApiResponse(ProductPriceChangeDetailDto) })
  @ApiNotFoundResponse({ description: 'PRICE_CHANGE_NOT_FOUND' })
  @Permissions(Read(Claim.PRICING))
  @Get(':changeId')
  async get(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('changeId', ParseUUIDPipe) changeId: string,
  ): Promise<BaseResponseDto<ProductPriceChangeDetailDto>> {
    return BaseResponseDto.success(
      ProductPriceChangeDetailDto.fromDetail(
        await this.reads.findDetail(locationId, changeId),
      ),
    );
  }

  @ApiOperation({ summary: 'Cancel a scheduled product price change' })
  @ApiOkResponse({ type: ApiResponse(ProductPriceChangeDetailDto) })
  @ApiNotFoundResponse({ description: 'PRICE_CHANGE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PRICE_CHANGE_NOT_SCHEDULED' })
  @Permissions(Write(Claim.PRICING))
  @Post(':changeId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('changeId', ParseUUIDPipe) changeId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductPriceChangeDetailDto>> {
    return BaseResponseDto.success(
      ProductPriceChangeDetailDto.fromDetail(
        await this.changes.cancel(
          locationId,
          changeId,
          auditActorFromToken(tokenPayload, locationId),
        ),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Return the previous retail prices of an applied change where they were not changed since',
  })
  @ApiOkResponse({ type: ApiResponse(ProductPriceChangeRollbackResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_CHANGE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PRICE_CHANGE_NOT_APPLIED' })
  @Permissions(Write(Claim.PRICING))
  @Post(':changeId/rollback')
  @HttpCode(HttpStatus.OK)
  async rollback(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('changeId', ParseUUIDPipe) changeId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductPriceChangeRollbackResponseDto>> {
    return BaseResponseDto.success(
      ProductPriceChangeRollbackResponseDto.fromView(
        await this.changes.rollback(
          locationId,
          changeId,
          auditActorFromToken(tokenPayload, locationId),
        ),
      ),
    );
  }
}

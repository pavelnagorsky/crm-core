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
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { SERVICE_PRICE_CHANGE_MAX_PAGE_SIZE } from '../constants/service-price-change.constants.js';
import { CreateServicePriceChangeDto } from '../dto/create-service-price-change.dto.js';
import { ServicePriceChangeDetailDto } from '../dto/service-price-change-detail.dto.js';
import { ServicePriceChangeListRequestDto } from '../dto/service-price-change-list-request.dto.js';
import { ServicePriceChangeListResponseDto } from '../dto/service-price-change-list-response.dto.js';
import { ServicePriceChangePreviewResponseDto } from '../dto/service-price-change-preview-response.dto.js';
import { ServicePriceChangeRollbackResponseDto } from '../dto/service-price-change-rollback-response.dto.js';
import { ServicePriceChangeSpecDto } from '../dto/service-price-change-spec.dto.js';
import { ServicePriceChangeSummaryDto } from '../dto/service-price-change-summary.dto.js';
import { ServicePriceUpcomingDto } from '../dto/service-price-upcoming.dto.js';
import { ServicePriceChangePreviewService } from '../services/service-price-change-preview.service.js';
import { ServicePriceChangeReadService } from '../services/service-price-change-read.service.js';
import { ServicePriceChangesService } from '../services/service-price-changes.service.js';

/** Price changes by a rule: preview, create, history, cancel, rollback. */
@ApiTags('Pricing')
@Controller('locations/:locationId/service-price-changes')
export class ServicePriceChangesController {
  constructor(
    private readonly previews: ServicePriceChangePreviewService,
    private readonly changes: ServicePriceChangesService,
    private readonly reads: ServicePriceChangeReadService,
  ) {}

  @ApiOperation({
    summary: 'Preview a price change rule: the price of each row now and after',
  })
  @ApiOkResponse({ type: ApiResponse(ServicePriceChangePreviewResponseDto) })
  @ApiBadRequestResponse({
    description:
      'SERVICE_PRICE_CHANGE_INVALID, SERVICE_PRICE_CHANGE_DATE_INVALID or SERVICE_PRICE_CHANGE_TOO_LARGE',
  })
  @Permissions(Read(Claim.PRICING))
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ServicePriceChangeSpecDto,
  ): Promise<BaseResponseDto<ServicePriceChangePreviewResponseDto>> {
    return BaseResponseDto.success(
      ServicePriceChangePreviewResponseDto.fromPreview(
        await this.previews.preview(locationId, dto),
      ),
    );
  }

  @ApiOperation({
    summary: 'Create a price change: apply now, or schedule from a date',
  })
  @ApiOkResponse({ type: ApiResponse(ServicePriceChangeDetailDto) })
  @ApiBadRequestResponse({
    description:
      'SERVICE_PRICE_CHANGE_INVALID, DATE_INVALID, TOO_LARGE, ROW_INVALID or EMPTY',
  })
  @ApiConflictResponse({
    description: 'SERVICE_PRICE_CHANGE_STALE, DATE_CONFLICT or LIMIT',
  })
  @Permissions(Write(Claim.PRICING))
  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateServicePriceChangeDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ServicePriceChangeDetailDto>> {
    return BaseResponseDto.success(
      ServicePriceChangeDetailDto.fromDetail(
        await this.changes.create(
          locationId,
          dto,
          auditActorFromToken(tokenPayload, locationId),
        ),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Nearest scheduled date and the scheduled base and bundle prices, for hints',
  })
  @ApiOkResponse({ type: ApiResponse(ServicePriceUpcomingDto) })
  @Permissions(Read(Claim.SERVICE))
  @Get('upcoming')
  async upcoming(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<ServicePriceUpcomingDto>> {
    return BaseResponseDto.success(
      ServicePriceUpcomingDto.fromView(await this.reads.upcoming(locationId)),
    );
  }

  @ApiOperation({ summary: 'History of price changes, scheduled ones first' })
  @ApiOkResponse({ type: ApiResponse(ServicePriceChangeListResponseDto) })
  @Permissions(Read(Claim.PRICING))
  @Get()
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: ServicePriceChangeListRequestDto,
  ): Promise<BaseResponseDto<ServicePriceChangeListResponseDto>> {
    const { items, totalItems, counts } = await this.reads.list(locationId, dto);
    return BaseResponseDto.success(
      new ServicePriceChangeListResponseDto(
        items.map(ServicePriceChangeSummaryDto.fromView),
        dto.page,
        Math.min(dto.pageSize, SERVICE_PRICE_CHANGE_MAX_PAGE_SIZE),
        totalItems,
        counts,
      ),
    );
  }

  @ApiOperation({ summary: 'One price change with its rows' })
  @ApiOkResponse({ type: ApiResponse(ServicePriceChangeDetailDto) })
  @ApiNotFoundResponse({ description: 'SERVICE_PRICE_CHANGE_NOT_FOUND' })
  @Permissions(Read(Claim.PRICING))
  @Get(':changeId')
  async get(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('changeId', ParseUUIDPipe) changeId: string,
  ): Promise<BaseResponseDto<ServicePriceChangeDetailDto>> {
    return BaseResponseDto.success(
      ServicePriceChangeDetailDto.fromDetail(
        await this.reads.findDetail(locationId, changeId),
      ),
    );
  }

  @ApiOperation({ summary: 'Cancel a scheduled price change' })
  @ApiOkResponse({ type: ApiResponse(ServicePriceChangeDetailDto) })
  @ApiNotFoundResponse({ description: 'SERVICE_PRICE_CHANGE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SERVICE_PRICE_CHANGE_NOT_SCHEDULED' })
  @Permissions(Write(Claim.PRICING))
  @Post(':changeId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('changeId', ParseUUIDPipe) changeId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ServicePriceChangeDetailDto>> {
    return BaseResponseDto.success(
      ServicePriceChangeDetailDto.fromDetail(
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
      'Return the previous prices of an applied change where they were not changed since',
  })
  @ApiOkResponse({ type: ApiResponse(ServicePriceChangeRollbackResponseDto) })
  @ApiNotFoundResponse({ description: 'SERVICE_PRICE_CHANGE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SERVICE_PRICE_CHANGE_NOT_APPLIED' })
  @Permissions(Write(Claim.PRICING))
  @Post(':changeId/rollback')
  @HttpCode(HttpStatus.OK)
  async rollback(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('changeId', ParseUUIDPipe) changeId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ServicePriceChangeRollbackResponseDto>> {
    return BaseResponseDto.success(
      ServicePriceChangeRollbackResponseDto.fromView(
        await this.changes.rollback(
          locationId,
          changeId,
          auditActorFromToken(tokenPayload, locationId),
        ),
      ),
    );
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PersonalPriceResponseDto } from '../dto/personal-price-response.dto.js';
import { PriceLevelFillApplyRequestDto } from '../dto/price-level-fill-apply-request.dto.js';
import { PriceLevelFillPreviewResponseDto } from '../dto/price-level-fill-preview-response.dto.js';
import { PriceLevelFillRequestDto } from '../dto/price-level-fill-request.dto.js';
import { PriceLevelFillResponseDto } from '../dto/price-level-fill-response.dto.js';
import { PriceLevelMatrixResponseDto } from '../dto/price-level-matrix-response.dto.js';
import { PriceLevelFillService } from '../services/price-level-fill.service.js';
import { PriceLevelMatrixService } from '../services/price-level-matrix.service.js';

/** Level prices as tables, and filling a level from the base prices. */
@ApiTags('Pricing')
@Controller('locations/:locationId/price-levels')
export class PriceLevelTablesController {
  constructor(
    private readonly matrix: PriceLevelMatrixService,
    private readonly fill: PriceLevelFillService,
  ) {}

  @ApiOperation({
    summary: 'Services by category with their price on every non-default level',
  })
  @ApiOkResponse({ type: ApiResponse(PriceLevelMatrixResponseDto) })
  @Permissions(Read(Claim.PRICING))
  @Get('matrix')
  async getMatrix(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<PriceLevelMatrixResponseDto>> {
    return BaseResponseDto.success(
      PriceLevelMatrixResponseDto.fromMatrix(
        await this.matrix.matrix(locationId),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Personal prices of active staff next to the price their level gives',
  })
  @ApiOkResponse({ type: ApiResponseArray(PersonalPriceResponseDto) })
  @Permissions(Read(Claim.PRICING))
  @Get('personal-prices')
  async getPersonalPrices(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<PersonalPriceResponseDto[]>> {
    const prices = await this.matrix.personalPrices(locationId);
    return BaseResponseDto.success(
      prices.map(PersonalPriceResponseDto.fromPrice),
    );
  }

  @ApiOperation({
    summary:
      'Preview filling a level from the base prices: the new price of each service',
  })
  @ApiOkResponse({ type: ApiResponse(PriceLevelFillPreviewResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_LEVEL_NOT_FOUND' })
  @ApiBadRequestResponse({ description: 'PRICE_LEVEL_DEFAULT_PRICE' })
  @Permissions(Read(Claim.PRICING))
  @Post(':levelId/bulk-fill/preview')
  @HttpCode(HttpStatus.OK)
  async previewFill(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('levelId', ParseUUIDPipe) levelId: string,
    @Body() dto: PriceLevelFillRequestDto,
  ): Promise<BaseResponseDto<PriceLevelFillPreviewResponseDto>> {
    const items = await this.fill.preview(locationId, levelId, dto);
    return BaseResponseDto.success(
      PriceLevelFillPreviewResponseDto.fromItems(items),
    );
  }

  @ApiOperation({
    summary:
      'Fill a level from the base prices for the selected services; prices are recomputed',
  })
  @ApiOkResponse({ type: ApiResponse(PriceLevelFillResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_LEVEL_NOT_FOUND' })
  @ApiBadRequestResponse({
    description: 'PRICE_LEVEL_DEFAULT_PRICE or PRICE_LEVEL_FILL_INVALID',
  })
  @Permissions(Write(Claim.PRICING))
  @Post(':levelId/bulk-fill')
  @HttpCode(HttpStatus.OK)
  async applyFill(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('levelId', ParseUUIDPipe) levelId: string,
    @Body() dto: PriceLevelFillApplyRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceLevelFillResponseDto>> {
    const updated = await this.fill.apply(
      locationId,
      levelId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(PriceLevelFillResponseDto.fromCount(updated));
  }
}

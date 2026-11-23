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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read } from '../../access/utils/permission.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { PriceExplainRequestDto } from '../dto/price-explain-request.dto.js';
import { PriceExplainResponseDto } from '../dto/price-explain-response.dto.js';
import { PriceWeekMapRequestDto } from '../dto/price-week-map-request.dto.js';
import { PriceWeekMapResponseDto } from '../dto/price-week-map-response.dto.js';
import { PriceExplainService } from '../services/price-explain.service.js';
import { PriceWeekMapService } from '../services/price-week-map.service.js';

/** Price check and week map: read-only views of how the price engine prices a visit. */
@ApiTags('Pricing')
@Controller('locations/:locationId/pricing')
export class PriceCheckController {
  constructor(
    private readonly explainService: PriceExplainService,
    private readonly weekMapService: PriceWeekMapService,
  ) {}

  @ApiOperation({
    summary:
      'Why a service or bundle costs what it costs at a local time, with the staff candidates and the rules that did not apply',
  })
  @ApiOkResponse({ type: ApiResponse(PriceExplainResponseDto) })
  @ApiNotFoundResponse({
    description: 'Service, bundle or staff member not found',
  })
  @Permissions(Read(Claim.PRICING))
  @Post('explain')
  @HttpCode(HttpStatus.OK)
  async explain(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: PriceExplainRequestDto,
  ): Promise<BaseResponseDto<PriceExplainResponseDto>> {
    const explain = await this.explainService.explain(locationId, dto);
    return BaseResponseDto.success(PriceExplainResponseDto.fromExplain(explain));
  }

  @ApiOperation({
    summary:
      'Price of a service over 7 days for a staff member, a level or the base level',
  })
  @ApiOkResponse({ type: ApiResponse(PriceWeekMapResponseDto) })
  @ApiNotFoundResponse({
    description: 'Service or staff member not found, or PRICE_LEVEL_NOT_FOUND',
  })
  @Permissions(Read(Claim.PRICING))
  @Get('week-map')
  async weekMap(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: PriceWeekMapRequestDto,
  ): Promise<BaseResponseDto<PriceWeekMapResponseDto>> {
    const map = await this.weekMapService.weekMap(locationId, query);
    return BaseResponseDto.success(PriceWeekMapResponseDto.fromMap(map));
  }
}

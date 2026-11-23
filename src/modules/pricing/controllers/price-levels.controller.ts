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
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { CreatePriceLevelDto } from '../dto/create-price-level.dto.js';
import { PriceLevelResponseDto } from '../dto/price-level-response.dto.js';
import { UpdatePriceLevelDto } from '../dto/update-price-level.dto.js';
import { PriceLevelsService } from '../services/price-levels.service.js';

@ApiTags('Pricing')
@Controller('locations/:locationId/price-levels')
export class PriceLevelsController {
  constructor(private readonly levels: PriceLevelsService) {}

  @ApiOperation({ summary: 'List the price levels of staff' })
  @ApiOkResponse({ type: ApiResponseArray(PriceLevelResponseDto) })
  @Permissions(Read(Claim.PRICING))
  @Get()
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<PriceLevelResponseDto[]>> {
    const levels = await this.levels.list(locationId);
    return BaseResponseDto.success(levels.map(PriceLevelResponseDto.fromView));
  }

  @ApiOperation({
    summary:
      'Create a price level; the first level of the location becomes the default one',
  })
  @ApiCreatedResponse({ type: ApiResponse(PriceLevelResponseDto) })
  @ApiConflictResponse({ description: 'PRICE_LEVEL_NAME_EXISTS' })
  @Permissions(Write(Claim.PRICING))
  @Post()
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreatePriceLevelDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceLevelResponseDto>> {
    const level = await this.levels.create(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(PriceLevelResponseDto.fromView(level));
  }

  @ApiOperation({ summary: 'Update a price level or make it the default one' })
  @ApiOkResponse({ type: ApiResponse(PriceLevelResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_LEVEL_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PRICE_LEVEL_NAME_EXISTS' })
  @Permissions(Write(Claim.PRICING))
  @Patch(':levelId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('levelId', ParseUUIDPipe) levelId: string,
    @Body() dto: UpdatePriceLevelDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceLevelResponseDto>> {
    const level = await this.levels.update(
      locationId,
      levelId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(PriceLevelResponseDto.fromView(level));
  }

  @ApiOperation({
    summary:
      'Delete a price level; its staff move to the default level and its prices are deleted',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'PRICE_LEVEL_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PRICE_LEVEL_DEFAULT_IN_USE' })
  @Permissions(Write(Claim.PRICING))
  @Delete(':levelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('levelId', ParseUUIDPipe) levelId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.levels.delete(
      locationId,
      levelId,
      auditActorFromToken(tokenPayload, locationId),
    );
  }
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read } from '../../access/utils/permission.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { PriceRulePreviewRequestDto } from '../dto/price-rule-preview-request.dto.js';
import { PriceRulePreviewResponseDto } from '../dto/price-rule-preview-response.dto.js';
import { RoundingPreviewRequestDto } from '../dto/rounding-preview-request.dto.js';
import { RoundingPreviewResponseDto } from '../dto/rounding-preview-response.dto.js';
import { PriceRoundingPreviewService } from '../services/price-rounding-preview.service.js';
import { PriceRulePreviewService } from '../services/price-rule-preview.service.js';

/** Previews of what a price setting would do. They read only: nothing is saved. */
@ApiTags('Pricing')
@Controller('locations/:locationId')
export class PricingPreviewController {
  constructor(
    private readonly rulePreview: PriceRulePreviewService,
    private readonly roundingPreview: PriceRoundingPreviewService,
  ) {}

  @ApiOperation({
    summary:
      'Preview a surcharge rule: status, next date, example prices, the surcharges it replaces and holiday conflicts',
  })
  @ApiOkResponse({ type: ApiResponse(PriceRulePreviewResponseDto) })
  @ApiBadRequestResponse({ description: 'PRICE_RULE_INVALID' })
  @ApiConflictResponse({ description: 'PRICE_RULE_ARCHIVED' })
  @Permissions(Read(Claim.PRICING))
  @Post('price-rules/preview')
  @HttpCode(HttpStatus.OK)
  async previewRule(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: PriceRulePreviewRequestDto,
  ): Promise<BaseResponseDto<PriceRulePreviewResponseDto>> {
    const preview = await this.rulePreview.preview(locationId, dto);
    return BaseResponseDto.success(
      PriceRulePreviewResponseDto.fromPreview(preview),
    );
  }

  @ApiOperation({
    summary:
      'Preview a rounding step on real services: a surcharge row each and a -15% promotion row rounded down',
  })
  @ApiOkResponse({ type: ApiResponse(RoundingPreviewResponseDto) })
  @Permissions(Read(Claim.PRICING))
  @Post('pricing/rounding-preview')
  @HttpCode(HttpStatus.OK)
  async previewRounding(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: RoundingPreviewRequestDto,
  ): Promise<BaseResponseDto<RoundingPreviewResponseDto>> {
    const examples = await this.roundingPreview.preview(
      locationId,
      dto.priceRoundingStep,
    );
    return BaseResponseDto.success(
      RoundingPreviewResponseDto.fromExamples(examples),
    );
  }
}

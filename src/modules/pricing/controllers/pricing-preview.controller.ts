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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read } from '../../access/utils/permission.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { RoundingPreviewRequestDto } from '../dto/rounding-preview-request.dto.js';
import { RoundingPreviewResponseDto } from '../dto/rounding-preview-response.dto.js';
import { PriceRoundingPreviewService } from '../services/price-rounding-preview.service.js';

/**
 * Previews of what a price setting would do. They read only: nothing is saved. The rule
 * preview lives in PriceRulesController: a promotion preview reads past bookings.
 */
@ApiTags('Pricing')
@Controller('locations/:locationId')
export class PricingPreviewController {
  constructor(
    private readonly roundingPreview: PriceRoundingPreviewService,
  ) {}

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

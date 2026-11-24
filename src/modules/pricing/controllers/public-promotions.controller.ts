import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { PublicPromotionDto } from '../dto/public-promotion.dto.js';
import { PromotionPublicService } from '../services/promotion-public.service.js';

/** Promotions on the booking page and in the widget (no authorization). */
@ApiTags('Pricing')
@Controller('public/locations/:locationId/promotions')
export class PublicPromotionsController {
  constructor(private readonly promotions: PromotionPublicService) {}

  @ApiOperation({
    summary:
      'A promotion for its shared link: conditions without the promo code (public)',
  })
  @ApiOkResponse({ type: ApiResponse(PublicPromotionDto) })
  @ApiNotFoundResponse({
    description:
      'PROMOTION_NOT_FOUND: archived, disabled, of another location or over',
  })
  @Get(':promotionId')
  @Header('Cache-Control', 'no-store')
  async get(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
  ): Promise<BaseResponseDto<PublicPromotionDto>> {
    const today = await this.promotions.locationToday(locationId);
    return BaseResponseDto.success(
      PublicPromotionDto.fromView(
        await this.promotions.findPublic(locationId, promotionId, today),
      ),
    );
  }
}

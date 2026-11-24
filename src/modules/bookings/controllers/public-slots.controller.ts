import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { PublicAvailableSlotsRequestDto } from '../dto/public-available-slots-request.dto.js';
import { PublicAvailableSlotsDayDto } from '../dto/public-available-slots-day.dto.js';
import { PublicSlotPricingService } from '../services/public-slot-pricing.service.js';

/**
 * Public slots live under the calendar URL but are served here: a slot carries a price, and
 * the calendar module does not know prices.
 */
@ApiTags('Calendar')
@Controller('locations/:locationId/calendar/public')
export class PublicSlotsController {
  constructor(private readonly slots: PublicSlotPricingService) {}

  @ApiOperation({
    summary:
      'Get available booking slots for a selection within the advance-booking window, each with the visit price and the assigned staff (public).',
  })
  @ApiOkResponse({ type: ApiResponseArray(PublicAvailableSlotsDayDto) })
  @ApiNotFoundResponse({ description: 'Location or service not found' })
  @Get('available-slots')
  @Header('Cache-Control', 'no-store')
  async getAvailableSlots(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: PublicAvailableSlotsRequestDto,
  ): Promise<BaseResponseDto<PublicAvailableSlotsDayDto[]>> {
    const days = await this.slots.getSlots(locationId, dto);
    return BaseResponseDto.success(
      days.map(PublicAvailableSlotsDayDto.fromResult),
    );
  }
}

import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { clientIp, requestOrigin } from '../../../shared/http/request-context.js';
import { BookingCreateService } from '../../bookings/services/booking-create.service.js';
import { CreateBookingDto } from '../../bookings/dto/create-booking.dto.js';
import { BookingChannelAttributionService } from '../services/booking-channel-attribution.service.js';

@ApiTags('Bookings')
@Controller()
export class PublicBookingCreateController {
  constructor(
    private readonly attribution: BookingChannelAttributionService,
    private readonly bookingCreateService: BookingCreateService,
  ) {}

  @ApiOperation({ summary: 'Book an appointment (public / client-facing)' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Location, service, or staff not found' })
  @ApiForbiddenResponse({
    description:
      'Location is closed for public booking, or this phone is banned from online booking',
  })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @Post('public/locations/:locationId/bookings')
  async createPublic(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateBookingDto,
    @Req() req: Request,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const attribution = await this.attribution.resolve(
      locationId,
      dto.bookingPageId,
      dto.bookingWidgetId,
      requestOrigin(req),
    );
    const booking = await this.bookingCreateService.createPublicBooking(
      locationId,
      dto,
      attribution,
      { ip: clientIp(req), origin: requestOrigin(req) },
    );
    return BaseResponseDto.success({ id: booking.id });
  }
}

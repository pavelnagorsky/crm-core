import {
  Body,
  Controller,
  Header,
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
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { PublicBookingCreatedResponseDto } from '../../bookings/dto/public-booking-created-response.dto.js';
import { BookingClientTokenService } from '../../bookings/services/booking-client-token.service.js';
import {
  clientIp,
  requestOrigin,
} from '../../../shared/http/request-context.js';
import { BookingCreateFacade } from '../../bookings/booking-create.facade.js';
import { CreateBookingDto } from '../../bookings/dto/create-booking.dto.js';
import { BookingChannelAttributionService } from '../services/booking-channel-attribution.service.js';

@ApiTags('Bookings')
@Controller()
export class PublicBookingCreateController {
  constructor(
    private readonly attribution: BookingChannelAttributionService,
    private readonly bookingCreateService: BookingCreateFacade,
    private readonly clientTokens: BookingClientTokenService,
  ) {}

  @ApiOperation({ summary: 'Book an appointment (public / client-facing)' })
  @ApiCreatedResponse({ type: ApiResponse(PublicBookingCreatedResponseDto) })
  @ApiNotFoundResponse({ description: 'Location, service, or staff not found' })
  @ApiForbiddenResponse({
    description:
      'Location is closed for public booking, or this phone is banned from online booking',
  })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @Post('public/locations/:locationId/bookings')
  @Header('Cache-Control', 'no-store')
  async createPublic(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateBookingDto,
    @Req() req: Request,
  ): Promise<BaseResponseDto<PublicBookingCreatedResponseDto>> {
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
    const token = this.clientTokens.generateClientToken(booking.id);
    return BaseResponseDto.success({
      id: booking.id,
      token,
      manageUrl: this.clientTokens.managementUrl(token),
    });
  }
}

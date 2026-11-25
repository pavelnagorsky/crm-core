import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { ClientReviewDto } from '../../reviews/dto/client-review.dto.js';
import { SubmitReviewDto } from '../../reviews/dto/submit-review.dto.js';
import { ClientBooking } from '../decorators/client-booking.decorator.js';
import { CancelBookingDto } from '../dto/cancel-booking.dto.js';
import { ClientBookingResponseDto } from '../dto/client-booking-response.dto.js';
import { ClientBookingSlotsRequestDto } from '../dto/client-booking-slots-request.dto.js';
import { PublicAvailableSlotsDayDto } from '../dto/public-available-slots-day.dto.js';
import { RescheduleClientBookingDto } from '../dto/reschedule-client-booking.dto.js';
import { JwtBookingClientGuard } from '../guards/jwt-booking-client.guard.js';
import type { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingClientService } from '../services/booking-client.service.js';

@ApiTags('Bookings')
@ApiBearerAuth('booking-client-token')
@ApiUnauthorizedResponse({ description: 'Invalid or expired booking link' })
@UseGuards(JwtBookingClientGuard)
@Controller('public/bookings/me')
export class BookingClientController {
  constructor(private readonly bookings: BookingClientService) {}

  @ApiOperation({ summary: 'Get booking info via client management token' })
  @ApiOkResponse({ type: ApiResponse(ClientBookingResponseDto) })
  @Get()
  @Header('Cache-Control', 'no-store')
  async getByClientToken(
    @ClientBooking() booking: BookingWithItems,
  ): Promise<BaseResponseDto<ClientBookingResponseDto>> {
    return BaseResponseDto.success(
      ClientBookingResponseDto.fromBooking(
        booking,
        await this.bookings.getReviewContext(booking),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Create or edit the review of this visit; one review per booking, no deletion',
  })
  @ApiForbiddenResponse({
    description:
      'REVIEW_NOT_ALLOWED: the visit is not completed or reviews are disabled',
  })
  @ApiBadRequestResponse({ description: 'Invalid rating or text' })
  @ApiOkResponse({ type: ApiResponse(ClientReviewDto) })
  @Put('review')
  @Header('Cache-Control', 'no-store')
  async submitReview(
    @ClientBooking() booking: BookingWithItems,
    @Body() dto: SubmitReviewDto,
  ): Promise<BaseResponseDto<ClientReviewDto>> {
    return BaseResponseDto.success(
      ClientReviewDto.fromEntity(
        await this.bookings.submitReview(booking, dto),
      ),
    );
  }

  @ApiOperation({ summary: 'Cancel booking via client management token' })
  @ApiForbiddenResponse({
    description: 'Only upcoming pending or confirmed bookings can be cancelled',
  })
  @ApiConflictResponse({
    description: 'Booking is already cancelled or changed concurrently',
  })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async cancelByClientToken(
    @ClientBooking() booking: BookingWithItems,
    @Body() dto: CancelBookingDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const cancelled = await this.bookings.cancelByClient(booking, dto);
    return BaseResponseDto.success({ id: cancelled.id });
  }

  @ApiOperation({
    summary:
      'Get available times for moving this booking, keeping its staff and services',
    description:
      'Each time has the price the booking would have there (docs/pricing-stage5-api.md): its services, staff and custom prices at that start, its client, promo code and channel, promotions by the day the booking was made, lead time from now. Send price as expectedTotal of the reschedule. staffIds are the staff of the booking items. A booking that cannot be priced any more (a service deactivated or the bundle edited) shows its current total at every time, without listPrice and promotionId, and moves at its prices.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid date range or range longer than 62 days',
  })
  @ApiForbiddenResponse({
    description: 'This booking can no longer be rescheduled',
  })
  @ApiOkResponse({ type: ApiResponseArray(PublicAvailableSlotsDayDto) })
  @Get('available-slots')
  @Header('Cache-Control', 'no-store')
  async getClientAvailableSlots(
    @ClientBooking() booking: BookingWithItems,
    @Query() dto: ClientBookingSlotsRequestDto,
  ): Promise<BaseResponseDto<PublicAvailableSlotsDayDto[]>> {
    const days = await this.bookings.availableSlots(booking, dto);
    return BaseResponseDto.success(
      days.map((day) => PublicAvailableSlotsDayDto.fromResult(day)),
    );
  }

  @ApiOperation({
    summary:
      'Reschedule this booking, keeping its staff, services and duration; the price is recalculated for the new time',
    description:
      'The price follows the new time both ways, by the rules of available-slots (docs/pricing-stage5-api.md). expectedTotal is the price of the chosen slot.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid local datetime or expectedTotal',
  })
  @ApiForbiddenResponse({
    description: 'This booking can no longer be rescheduled',
  })
  @ApiConflictResponse({
    description:
      'The slot is unavailable or the booking changed concurrently. PRICE_CHANGED { expectedTotal, total, items: [{ serviceId, serviceTitle, staffId, staffName, price }], promoCode }: the price at this time differs, confirm and send again with expectedTotal = total. PROMOTION_NOT_APPLICABLE: a limited promotion ran out meanwhile, reload the times',
  })
  @ApiOkResponse({ type: ApiResponse(ClientBookingResponseDto) })
  @Post('reschedule')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async rescheduleByClientToken(
    @ClientBooking() booking: BookingWithItems,
    @Body() dto: RescheduleClientBookingDto,
  ): Promise<BaseResponseDto<ClientBookingResponseDto>> {
    const updated = await this.bookings.rescheduleByClient(booking, dto);
    return BaseResponseDto.success(
      ClientBookingResponseDto.fromBooking(updated),
    );
  }
}

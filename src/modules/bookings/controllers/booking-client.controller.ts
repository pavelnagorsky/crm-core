import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
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
import { AvailableSlotsDayDto } from '../../calendar/dto/available-slots-day.dto.js';
import { ClientBooking } from '../decorators/client-booking.decorator.js';
import { CancelBookingDto } from '../dto/cancel-booking.dto.js';
import { ClientBookingResponseDto } from '../dto/client-booking-response.dto.js';
import { ClientBookingSlotsRequestDto } from '../dto/client-booking-slots-request.dto.js';
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
      ClientBookingResponseDto.fromBooking(booking),
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
  })
  @ApiBadRequestResponse({
    description: 'Invalid date range or range longer than 62 days',
  })
  @ApiForbiddenResponse({
    description: 'This booking can no longer be rescheduled',
  })
  @ApiOkResponse({ type: ApiResponseArray(AvailableSlotsDayDto) })
  @Get('available-slots')
  @Header('Cache-Control', 'no-store')
  async getClientAvailableSlots(
    @ClientBooking() booking: BookingWithItems,
    @Query() dto: ClientBookingSlotsRequestDto,
  ): Promise<BaseResponseDto<AvailableSlotsDayDto[]>> {
    return BaseResponseDto.success(
      await this.bookings.availableSlots(booking, dto),
    );
  }

  @ApiOperation({
    summary:
      'Reschedule this booking, keeping its staff, services, duration and prices',
  })
  @ApiBadRequestResponse({ description: 'Invalid local datetime' })
  @ApiForbiddenResponse({
    description: 'This booking can no longer be rescheduled',
  })
  @ApiConflictResponse({
    description: 'The slot is unavailable or the booking changed concurrently',
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

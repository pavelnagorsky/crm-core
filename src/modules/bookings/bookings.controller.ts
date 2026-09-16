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
  Query,
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
import { BusinessRole, CancelledBy } from '@prisma/client';
import { BookingsService } from './bookings.service.js';
import { BookingCreateService } from './booking-create.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingResponseDto } from './dto/booking-response.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchResponseDto } from './dto/booking-search-response.dto.js';
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/interfaces/audit-actor-from-token.js';

@ApiTags('Bookings')
@Controller()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingCreateService: BookingCreateService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Book an appointment (public / client-facing)' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Business, service, or staff not found' })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @Post('public/businesses/:businessId/bookings')
  async createPublic(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateBookingDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingCreateService.createPublicBooking(businessId, dto);
    return BaseResponseDto.success({ id: booking.id });
  }

  // ─── Owner / Staff ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a booking manually (owner / staff)' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Business, service, or staff not found' })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Post('businesses/:businessId/bookings/manual')
  async createManual(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: ManualCreateBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingCreateService.createManualBooking(businessId, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Update booking status' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Patch('businesses/:businessId/bookings/:id/status')
  async updateStatus(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.updateStatus(id, businessId, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiOkResponse({ type: ApiResponse(BookingResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('businesses/:businessId/bookings/:id')
  async findById(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<BookingResponseDto>> {
    const booking = await this.bookingsService.findById(id, businessId);
    return BaseResponseDto.success(BookingResponseDto.fromEntity(booking));
  }

  @ApiOperation({ summary: 'Search bookings' })
  @ApiOkResponse({ type: ApiResponse(BookingSearchResponseDto) })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('businesses/:businessId/bookings')
  async search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: BookingSearchRequestDto,
  ): Promise<BaseResponseDto<BookingSearchResponseDto>> {
    const { items, totalItems } = await this.bookingsService.search(businessId, dto);
    return BaseResponseDto.success(
      new BookingSearchResponseDto(items.map(BookingResponseDto.fromEntity), dto.page, dto.pageSize, totalItems, dto.isExport),
    );
  }

  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({ description: 'Booking is already cancelled' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Post('businesses/:businessId/bookings/:id/cancel')
  async cancel(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.cancel(id, businessId, CancelledBy.STAFF, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Delete a booking' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete('businesses/:businessId/bookings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.bookingsService.delete(id, businessId, auditActorFromToken(tokenPayload, businessId));
  }
}

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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BusinessRole, CancelledBy } from '@prisma/client';
import { BookingsService } from './bookings.service.js';
import { BookingCreateService } from './booking-create.service.js';
import { BookingClientService } from './booking-client.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { UpdateBookingDto } from './dto/update-booking.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingResponseDto } from './dto/booking-response.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchResponseDto } from './dto/booking-search-response.dto.js';
import { ClientLinkResponseDto } from './dto/client-link-response.dto.js';
import { BookingClientTokenPayloadDto } from './dto/booking-client-token-payload.dto.js';
import { JwtBookingClientGuard } from './guards/jwt-booking-client.guard.js';
import { BookingClientToken } from './decorators/booking-client-token.decorator.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto, assertBusinessRole } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';

@ApiTags('Bookings')
@Controller()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingCreateService: BookingCreateService,
    private readonly bookingClientService: BookingClientService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Book an appointment (public / client-facing)' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Business, service, or staff not found' })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @Post('public/bookings')
  async createPublic(
    @Body() dto: CreateBookingDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingCreateService.createPublicBooking(dto.businessId, dto);
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Get booking info via client management token' })
  @ApiOkResponse({ type: ApiResponse(BookingResponseDto) })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired token' })
  @ApiBearerAuth('booking-client-token')
  @UseGuards(JwtBookingClientGuard)
  @Get('public/bookings/me')
  async getByClientToken(
    @BookingClientToken() tokenPayload: BookingClientTokenPayloadDto,
  ): Promise<BaseResponseDto<BookingResponseDto>> {
    const booking = await this.bookingsService.findById(tokenPayload.bookingId);
    return BaseResponseDto.success(BookingResponseDto.fromEntityPublic(booking));
  }

  @ApiOperation({ summary: 'Cancel booking via client management token' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired token' })
  @ApiConflictResponse({ description: 'Booking is already cancelled' })
  @ApiBearerAuth('booking-client-token')
  @UseGuards(JwtBookingClientGuard)
  @Post('public/bookings/me/cancel')
  async cancelByClientToken(
    @BookingClientToken() tokenPayload: BookingClientTokenPayloadDto,
    @Body() dto: CancelBookingDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.cancelByClient(tokenPayload.bookingId, dto);
    return BaseResponseDto.success({ id: booking.id });
  }

  // ─── Owner / Staff ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a booking manually (owner / staff)' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Business, service, or staff not found' })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @Auth()
  @Post('bookings/manual')
  async createManual(
    @Body() dto: ManualCreateBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const booking = await this.bookingCreateService.createManualBooking(dto.businessId, dto, auditActorFromToken(tokenPayload, dto.businessId));
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiOkResponse({ type: ApiResponse(BookingResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Auth()
  @Get('bookings/:id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingResponseDto>> {
    const booking = await this.bookingsService.findById(id);
    assertBusinessRole(tokenPayload, booking.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    return BaseResponseDto.success(BookingResponseDto.fromEntity(booking));
  }

  @ApiOperation({ summary: 'Search bookings' })
  @ApiOkResponse({ type: ApiResponse(BookingSearchResponseDto) })
  @Auth()
  @Get('bookings')
  async search(
    @Query() dto: BookingSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingSearchResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { items, totalItems } = await this.bookingsService.search(dto.businessId, dto);
    return BaseResponseDto.success(
      new BookingSearchResponseDto(items.map(BookingResponseDto.fromEntity), dto.page, dto.pageSize, totalItems, dto.isExport),
    );
  }

  @ApiOperation({ summary: 'Update booking (owner / staff)' })
  @ApiOkResponse({ type: ApiResponse(BookingResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @Auth()
  @Patch('bookings/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingResponseDto>> {
    const booking = await this.bookingsService.update(id, tokenPayload, dto);
    return BaseResponseDto.success(BookingResponseDto.fromEntity(booking));
  }

  @ApiOperation({ summary: 'Update booking status' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Auth()
  @Patch('bookings/:id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.updateStatus(id, tokenPayload, dto);
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Generate client management token for a booking' })
  @ApiOkResponse({ type: ApiResponse(ClientLinkResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Auth()
  @Post('bookings/:id/client-token')
  async generateClientToken(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientLinkResponseDto>> {
    const booking = await this.bookingsService.findById(id);
    assertBusinessRole(tokenPayload, booking.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const token = this.bookingClientService.generateClientToken(id);
    return BaseResponseDto.success({ token });
  }

  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({ description: 'Booking is already cancelled' })
  @Auth()
  @Post('bookings/:id/cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.cancel(id, tokenPayload, CancelledBy.STAFF, dto);
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Delete a booking' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Auth()
  @Delete('bookings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.bookingsService.delete(id, tokenPayload);
  }
}

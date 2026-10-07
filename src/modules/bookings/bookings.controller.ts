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
  Put,
  Query,
  Res,
  StreamableFile,
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
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BusinessRole, CancelledBy } from '@prisma/client';
import { BookingsService } from './bookings.service.js';
import { BookingCreateService } from './booking-create.service.js';
import { BookingClientService } from './booking-client.service.js';
import { BookingSetupResponseDto } from './dto/booking-setup-response.dto.js';
import { BookingResolveRequestDto } from './dto/booking-resolve-request.dto.js';
import { BookingResolveResponseDto } from './dto/booking-resolve-response.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { UpdateBookingDto } from './dto/update-booking.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingResponseDto } from './dto/booking-response.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchResponseDto } from './dto/booking-search-response.dto.js';
import { BookingStatusCountResponseDto } from './dto/booking-status-count-response.dto.js';
import { BookingExportRequestDto } from './bookings-export/dto/booking-export-request.dto.js';
import { BookingsExportService } from './bookings-export/bookings-export.service.js';
import { XlsxService } from '../../shared/xlsx/xlsx.service.js';
import { ClientLinkResponseDto } from './dto/client-link-response.dto.js';
import { BookingClientTokenPayloadDto } from './dto/booking-client-token-payload.dto.js';
import { JwtBookingClientGuard } from './guards/jwt-booking-client.guard.js';
import { BookingClientToken } from './decorators/booking-client-token.decorator.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { assertLocationRole } from '../auth/guards/assert-location-role.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';

@ApiTags('Bookings')
@Controller()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingCreateService: BookingCreateService,
    private readonly bookingClientService: BookingClientService,
    private readonly bookingsExportService: BookingsExportService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Get services and staff for booking screen (public)',
  })
  @ApiOkResponse({ type: ApiResponse(BookingSetupResponseDto) })
  @Get('public/locations/:locationId/booking-setup')
  async getBookingSetup(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<BookingSetupResponseDto>> {
    return BaseResponseDto.success(
      await this.bookingsService.getBookingSetup(locationId),
    );
  }

  @ApiOperation({
    summary:
      'Resolve available services/staff for a partial booking selection (public)',
  })
  @ApiOkResponse({ type: ApiResponse(BookingResolveResponseDto) })
  @Post('public/locations/:locationId/booking-resolve')
  async resolveBooking(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: BookingResolveRequestDto,
  ): Promise<BaseResponseDto<BookingResolveResponseDto>> {
    return BaseResponseDto.success(
      await this.bookingsService.resolveBookingSelection(locationId, dto),
    );
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
    return BaseResponseDto.success(
      BookingResponseDto.fromEntityPublic(booking),
    );
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
    const booking = await this.bookingsService.cancelByClient(
      tokenPayload.bookingId,
      dto,
    );
    return BaseResponseDto.success({ id: booking.id });
  }

  // ─── Owner / Staff ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a booking manually (owner / staff)' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Location, service, or staff not found' })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @Auth()
  @Post('locations/:locationId/bookings/manual')
  async createManual(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ManualCreateBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const booking = await this.bookingCreateService.createManualBooking(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Get booking count per status' })
  @ApiOkResponse({ type: ApiResponseArray(BookingStatusCountResponseDto) })
  @Auth()
  @Get('locations/:locationId/bookings/status-counts')
  async getStatusCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingStatusCountResponseDto[]>> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const counts = await this.bookingsService.getStatusCounts(locationId);
    return BaseResponseDto.success(
      counts.map((r) => Object.assign(new BookingStatusCountResponseDto(), r)),
    );
  }

  @ApiOperation({ summary: 'Export bookings as XLSX' })
  @ApiProduces(XlsxService.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Auth()
  @Get('locations/:locationId/bookings/export')
  async export(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: BookingExportRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const { stream, filename } = await this.bookingsExportService.stream(
      locationId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxService.mimeType });
  }

  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiOkResponse({ type: ApiResponse(BookingResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Auth()
  @Get('locations/:locationId/bookings/:id')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingResponseDto>> {
    const booking = await this.bookingsService.findByIdInLocation(
      locationId,
      id,
    );
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    return BaseResponseDto.success(BookingResponseDto.fromEntity(booking));
  }

  @ApiOperation({ summary: 'Search bookings' })
  @ApiOkResponse({ type: ApiResponse(BookingSearchResponseDto) })
  @Auth()
  @Get('locations/:locationId/bookings')
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: BookingSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingSearchResponseDto>> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const { items, totalItems } = await this.bookingsService.search(
      locationId,
      dto,
    );
    return BaseResponseDto.success(
      new BookingSearchResponseDto(
        items.map(BookingResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Update booking (owner / staff)' })
  @ApiOkResponse({ type: ApiResponse(BookingResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @Auth()
  @Put('locations/:locationId/bookings/:id')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingResponseDto>> {
    const booking = await this.bookingsService.update(
      locationId,
      id,
      tokenPayload,
      dto,
    );
    return BaseResponseDto.success(BookingResponseDto.fromEntity(booking));
  }

  @ApiOperation({ summary: 'Update booking status' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Auth()
  @Patch('locations/:locationId/bookings/:id/status')
  async updateStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.updateStatus(
      locationId,
      id,
      tokenPayload,
      dto,
    );
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Generate client management token for a booking' })
  @ApiOkResponse({ type: ApiResponse(ClientLinkResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Auth()
  @Post('locations/:locationId/bookings/:id/client-token')
  async generateClientToken(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientLinkResponseDto>> {
    await this.bookingsService.findByIdInLocation(locationId, id);
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const token = this.bookingClientService.generateClientToken(id);
    return BaseResponseDto.success({ token });
  }

  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({ description: 'Booking is already cancelled' })
  @Auth()
  @Post('locations/:locationId/bookings/:id/cancel')
  async cancel(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.cancel(
      locationId,
      id,
      tokenPayload,
      CancelledBy.STAFF,
      dto,
    );
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Delete a booking' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Auth()
  @Delete('locations/:locationId/bookings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.bookingsService.delete(locationId, id, tokenPayload);
  }
}

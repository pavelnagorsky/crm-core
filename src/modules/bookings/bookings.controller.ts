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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingResponseDto } from './dto/booking-response.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchResponseDto } from './dto/booking-search-response.dto.js';
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';

@ApiTags('Bookings')
@Controller('businesses/:businessId/bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @ApiOperation({ summary: 'Create a booking' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Client, staff, or service not found' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Post()
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateBookingDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.create(businessId, dto);
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Update booking status' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Patch(':id/status')
  async updateStatus(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const booking = await this.bookingsService.updateStatus(id, businessId, dto);
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiOkResponse({ type: ApiResponse(BookingResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<BookingResponseDto>> {
    const booking = await this.bookingsService.findById(id);
    return BaseResponseDto.success(BookingResponseDto.fromEntity(booking));
  }

  @ApiOperation({ summary: 'Search bookings' })
  @ApiOkResponse({ type: ApiResponse(BookingSearchResponseDto) })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get()
  async search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: BookingSearchRequestDto,
  ): Promise<BaseResponseDto<BookingSearchResponseDto>> {
    const { items, totalItems } = await this.bookingsService.search(businessId, dto);
    return BaseResponseDto.success(
      new BookingSearchResponseDto(items.map(BookingResponseDto.fromEntity), dto.page, dto.pageSize, totalItems, dto.isExport),
    );
  }

  @ApiOperation({ summary: 'Delete a booking' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.bookingsService.delete(id, businessId);
  }
}

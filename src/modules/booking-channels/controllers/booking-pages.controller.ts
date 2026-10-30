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
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { BookingPageResponseDto } from '../dto/booking-page-response.dto.js';
import { SaveBookingPageDto } from '../dto/save-booking-page.dto.js';
import { SlugAvailabilityQueryDto } from '../dto/slug-availability-query.dto.js';
import { SlugAvailabilityResponseDto } from '../dto/slug-availability-response.dto.js';
import { UpdateBookingChannelStatusDto } from '../dto/update-booking-channel-status.dto.js';
import { BookingPageWithCover } from '../interfaces/booking-page-with-cover.interface.js';
import { BookingChannelStatsService } from '../services/booking-channel-stats.service.js';
import { BookingPagesService } from '../services/booking-pages.service.js';

@ApiTags('Booking pages')
@Controller('locations/:locationId/booking-pages')
export class BookingPagesController {
  constructor(
    private readonly pages: BookingPagesService,
    private readonly stats: BookingChannelStatsService,
  ) {}

  @ApiOperation({ summary: 'Check whether a booking page slug can be used' })
  @ApiOkResponse({ type: ApiResponse(SlugAvailabilityResponseDto) })
  @Permissions(Read(Claim.BOOKING_CHANNEL))
  @Get('slug-availability')
  async checkSlug(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: SlugAvailabilityQueryDto,
  ): Promise<BaseResponseDto<SlugAvailabilityResponseDto>> {
    const result = await this.pages.checkSlug(
      locationId,
      query.slug,
      query.pageId,
    );
    return BaseResponseDto.success(SlugAvailabilityResponseDto.from(result));
  }

  @ApiOperation({ summary: 'List booking pages' })
  @ApiOkResponse({ type: ApiResponseArray(BookingPageResponseDto) })
  @Permissions(Read(Claim.BOOKING_CHANNEL))
  @Get()
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<BookingPageResponseDto[]>> {
    const pages = await this.pages.list(locationId);
    const stats = await this.stats.forPages(
      locationId,
      pages.map((item) => item.id),
    );
    return BaseResponseDto.success(
      pages.map((item) =>
        BookingPageResponseDto.fromEntity(item, stats.get(item.id)),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Create the only booking page for a location. It starts as a draft.',
  })
  @ApiCreatedResponse({ type: ApiResponse(BookingPageResponseDto) })
  @ApiConflictResponse({
    description:
      'A booking page already exists for this location or slug is already used',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Cover is not an image from this business',
  })
  @Permissions(Write(Claim.BOOKING_CHANNEL))
  @Post()
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: SaveBookingPageDto,
  ): Promise<BaseResponseDto<BookingPageResponseDto>> {
    const page = await this.pages.create(locationId, dto);
    return BaseResponseDto.success(BookingPageResponseDto.fromEntity(page));
  }

  @ApiOperation({ summary: 'Get a booking page' })
  @ApiOkResponse({ type: ApiResponse(BookingPageResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking page not found' })
  @Permissions(Read(Claim.BOOKING_CHANNEL))
  @Get(':pageId')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<BaseResponseDto<BookingPageResponseDto>> {
    const page = await this.pages.findInLocation(locationId, pageId);
    return this.toResponse(page);
  }

  @ApiOperation({
    summary: 'Replace booking page content. Status is unchanged.',
  })
  @ApiOkResponse({ type: ApiResponse(BookingPageResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking page not found' })
  @ApiConflictResponse({ description: 'Slug is already used' })
  @ApiUnprocessableEntityResponse({
    description: 'Cover is not an image from this business',
  })
  @Permissions(Write(Claim.BOOKING_CHANNEL))
  @Put(':pageId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: SaveBookingPageDto,
  ): Promise<BaseResponseDto<BookingPageResponseDto>> {
    const page = await this.pages.update(locationId, pageId, dto);
    return this.toResponse(page);
  }

  @ApiOperation({ summary: 'Publish or unpublish a booking page' })
  @ApiOkResponse({ type: ApiResponse(BookingPageResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking page not found' })
  @ApiConflictResponse({
    description:
      'Status is already set, booking is closed, or nothing is bookable',
  })
  @Permissions(Write(Claim.BOOKING_CHANNEL))
  @Patch(':pageId/status')
  async updateStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: UpdateBookingChannelStatusDto,
  ): Promise<BaseResponseDto<BookingPageResponseDto>> {
    const page = await this.pages.changeStatus(locationId, pageId, dto.status);
    return this.toResponse(page);
  }

  @ApiOperation({ summary: 'Delete a booking page' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking page not found' })
  @Permissions(Write(Claim.BOOKING_CHANNEL))
  @Delete(':pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<void> {
    await this.pages.delete(locationId, pageId);
  }

  private async toResponse(
    page: BookingPageWithCover,
  ): Promise<BaseResponseDto<BookingPageResponseDto>> {
    const stats = await this.stats.forPages(page.locationId, [page.id]);
    return BaseResponseDto.success(
      BookingPageResponseDto.fromEntity(page, stats.get(page.id)),
    );
  }
}

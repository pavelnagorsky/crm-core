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
import { BusinessRole } from '@prisma/client';
import { LocationRBAC } from '../../auth/decorators/location-rbac.decorator.js';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { BookingPagesService } from '../services/booking-pages.service.js';
import { SaveBookingPageDto } from '../dto/save-booking-page.dto.js';
import { BookingPageResponseDto } from '../dto/booking-page-response.dto.js';
import { UpdateBookingChannelStatusDto } from '../dto/update-booking-channel-status.dto.js';
import { SlugAvailabilityQueryDto } from '../dto/slug-availability-query.dto.js';
import { SlugAvailabilityResponseDto } from '../dto/slug-availability-response.dto.js';

@ApiTags('Booking pages')
@Controller('locations/:locationId/booking-pages')
export class BookingPagesController {
  constructor(private readonly pages: BookingPagesService) {}

  @ApiOperation({ summary: 'Check whether a booking page slug can be used' })
  @ApiOkResponse({ type: ApiResponse(SlugAvailabilityResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
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
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get()
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<BookingPageResponseDto[]>> {
    const pages = await this.pages.list(locationId);
    return BaseResponseDto.success(
      pages.map(BookingPageResponseDto.fromEntity),
    );
  }

  @ApiOperation({ summary: 'Create a booking page. It starts as a draft.' })
  @ApiCreatedResponse({ type: ApiResponse(BookingPageResponseDto) })
  @ApiConflictResponse({ description: 'Slug is already used' })
  @ApiUnprocessableEntityResponse({
    description: 'Cover is not an image from this business',
  })
  @LocationRBAC(BusinessRole.OWNER)
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
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get(':pageId')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<BaseResponseDto<BookingPageResponseDto>> {
    const page = await this.pages.findInLocation(locationId, pageId);
    return BaseResponseDto.success(BookingPageResponseDto.fromEntity(page));
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
  @LocationRBAC(BusinessRole.OWNER)
  @Put(':pageId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: SaveBookingPageDto,
  ): Promise<BaseResponseDto<BookingPageResponseDto>> {
    const page = await this.pages.update(locationId, pageId, dto);
    return BaseResponseDto.success(BookingPageResponseDto.fromEntity(page));
  }

  @ApiOperation({ summary: 'Publish or unpublish a booking page' })
  @ApiOkResponse({ type: ApiResponse(BookingPageResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking page not found' })
  @ApiConflictResponse({
    description:
      'Status is already set, booking is closed, or nothing is bookable',
  })
  @LocationRBAC(BusinessRole.OWNER)
  @Patch(':pageId/status')
  async updateStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: UpdateBookingChannelStatusDto,
  ): Promise<BaseResponseDto<BookingPageResponseDto>> {
    const page = await this.pages.changeStatus(locationId, pageId, dto.status);
    return BaseResponseDto.success(BookingPageResponseDto.fromEntity(page));
  }

  @ApiOperation({ summary: 'Delete a booking page' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking page not found' })
  @LocationRBAC(BusinessRole.OWNER)
  @Delete(':pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<void> {
    await this.pages.delete(locationId, pageId);
  }
}

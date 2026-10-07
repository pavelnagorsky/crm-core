import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { requestOrigin } from '../../shared/http/request-context.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { LocationService } from '../location/location.service.js';
import { BookingPagesService } from './booking-pages.service.js';
import { BookingWidgetsService } from './booking-widgets.service.js';
import { PublicBookingPageResponseDto } from './dto/public-booking-page-response.dto.js';
import { PublicBookingWidgetResponseDto } from './dto/public-booking-widget-response.dto.js';

@ApiTags('Public booking')
@Controller('public')
export class PublicBookingChannelsController {
  constructor(
    private readonly pages: BookingPagesService,
    private readonly widgets: BookingWidgetsService,
    private readonly locationService: LocationService,
    private readonly bookingsService: BookingsService,
  ) {}

  @ApiOperation({ summary: 'Get a published booking page by slug' })
  @ApiOkResponse({ type: ApiResponse(PublicBookingPageResponseDto) })
  @ApiNotFoundResponse({ description: 'Published booking page not found' })
  @Get('booking-pages/:slug')
  async getPage(
    @Param('slug') slug: string,
  ): Promise<BaseResponseDto<PublicBookingPageResponseDto>> {
    const page = await this.pages.getPublishedBySlug(slug);
    const [location, setup] = await Promise.all([
      this.locationService.findPublicProfile(page.locationId),
      this.bookingsService.getBookingSetup(page.locationId),
    ]);
    return BaseResponseDto.success(
      PublicBookingPageResponseDto.from(page, location, setup),
    );
  }

  @ApiOperation({
    summary: 'Get a published booking widget for the embed runtime',
  })
  @ApiOkResponse({ type: ApiResponse(PublicBookingWidgetResponseDto) })
  @ApiNotFoundResponse({ description: 'Published booking widget not found' })
  @ApiForbiddenResponse({
    description: 'Request origin is not in allowedDomains',
  })
  @Get('booking-widgets/:widgetId')
  async getWidget(
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Req() req: Request,
  ): Promise<BaseResponseDto<PublicBookingWidgetResponseDto>> {
    const widget = await this.widgets.getPublished(
      widgetId,
      requestOrigin(req),
    );
    const [location, setup] = await Promise.all([
      this.locationService.findPublicProfile(widget.locationId),
      this.bookingsService.getBookingSetup(widget.locationId),
    ]);
    return BaseResponseDto.success(
      PublicBookingWidgetResponseDto.from(widget, location, setup),
    );
  }
}

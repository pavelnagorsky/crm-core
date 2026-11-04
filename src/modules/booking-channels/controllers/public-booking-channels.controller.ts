import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { BookingSetupResponseDto } from '../../bookings/dto/booking-setup-response.dto.js';
import { LocationService } from '../../location/services/location.service.js';
import { PublicBookingPageResponseDto } from '../dto/public-booking-page-response.dto.js';
import { PublicBookingWidgetResponseDto } from '../dto/public-booking-widget-response.dto.js';
import { BookingPagesService } from '../services/booking-pages.service.js';
import { BookingWidgetsService } from '../services/booking-widgets.service.js';
import { WidgetPageUrlPipe } from '../pipes/widget-page-url.pipe.js';
import { WidgetPageUrlHeader } from '../decorators/widget-page-url-header.decorator.js';

@ApiTags('Public booking')
@Controller('public')
export class PublicBookingChannelsController {
  constructor(
    private readonly pages: BookingPagesService,
    private readonly widgets: BookingWidgetsService,
    private readonly locationService: LocationService,
    private readonly bookings: BookingsFacade,
  ) {}

  @ApiOperation({ summary: 'Get a published booking page by slug' })
  @ApiOkResponse({ type: ApiResponse(PublicBookingPageResponseDto) })
  @ApiNotFoundResponse({ description: 'Published booking page not found' })
  @Get('booking-pages/:slug')
  @Header('Cache-Control', 'no-store')
  async getPage(
    @Param('slug') slug: string,
  ): Promise<BaseResponseDto<PublicBookingPageResponseDto>> {
    const page = await this.pages.getPublishedBySlug(slug);
    const [location, setup] = await Promise.all([
      this.locationService.findPublicProfile(page.locationId),
      this.bookings.getBookingSetup(page.locationId),
    ]);
    return BaseResponseDto.success(
      PublicBookingPageResponseDto.from(
        page,
        location,
        BookingSetupResponseDto.fromEntity(setup),
      ),
    );
  }

  @ApiOperation({
    summary: 'Get a published booking widget for the embed runtime',
  })
  @ApiOkResponse({ type: ApiResponse(PublicBookingWidgetResponseDto) })
  @ApiHeader({
    name: 'X-Widget-Page-Url',
    required: false,
    description:
      'Full HTTP(S) URL of the embedding page, up to 4096 characters',
  })
  @ApiBadRequestResponse({ description: 'Invalid embedding page URL' })
  @ApiNotFoundResponse({ description: 'Published booking widget not found' })
  @Get('booking-widgets/:widgetId')
  @Header('Cache-Control', 'no-store')
  async getWidget(
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @WidgetPageUrlHeader(WidgetPageUrlPipe) pageUrl: string | null = null,
  ): Promise<BaseResponseDto<PublicBookingWidgetResponseDto>> {
    const widget = await this.widgets.getPublished(widgetId);
    const [location, setup] = await Promise.all([
      this.locationService.findPublicProfile(widget.locationId),
      this.bookings.getBookingSetup(widget.locationId),
    ]);
    await this.widgets.recordInitialization(widgetId, pageUrl);
    return BaseResponseDto.success(
      PublicBookingWidgetResponseDto.from(
        widget,
        location,
        BookingSetupResponseDto.fromEntity(setup),
      ),
    );
  }
}

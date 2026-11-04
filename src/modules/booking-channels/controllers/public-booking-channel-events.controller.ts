import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { RecordBookingChannelEventDto } from '../dto/record-booking-channel-event.dto.js';
import { BookingChannelEventsRateGuard } from '../guards/booking-channel-events-rate.guard.js';
import { BookingChannelStatsService } from '../services/booking-channel-stats.service.js';

@ApiTags('Public booking')
@Controller('public')
@UseGuards(BookingChannelEventsRateGuard)
@ApiTooManyRequestsResponse({ description: 'Too many events from this IP' })
export class PublicBookingChannelEventsController {
  constructor(private readonly stats: BookingChannelStatsService) {}

  @Post('booking-pages/:pageId/events')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Count a view or form open for a published booking page',
  })
  @ApiOkResponse({ type: BaseResponseDto })
  @ApiNotFoundResponse({ description: 'Published booking page not found' })
  async recordPage(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: RecordBookingChannelEventDto,
  ): Promise<BaseResponseDto<null>> {
    await this.stats.recordPage(pageId, dto.event);
    return BaseResponseDto.success(null);
  }

  @Post('booking-widgets/:widgetId/events')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Count a view or form open for a published booking widget',
  })
  @ApiOkResponse({ type: BaseResponseDto })
  @ApiNotFoundResponse({ description: 'Published booking widget not found' })
  async recordWidget(
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Body() dto: RecordBookingChannelEventDto,
  ): Promise<BaseResponseDto<null>> {
    await this.stats.recordWidget(widgetId, dto.event);
    return BaseResponseDto.success(null);
  }
}

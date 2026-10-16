import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingsAnalyticsService } from './bookings-analytics.service.js';
import { BookingsAnalyticsRequestDto } from './dto/bookings-analytics-request.dto.js';
import { BookingsAnalyticsResponseDto } from './dto/bookings-analytics-response.dto.js';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';

@ApiTags('Bookings')
@Controller('locations/:locationId')
export class BookingsAnalyticsController {
  constructor(private readonly analyticsService: BookingsAnalyticsService) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the bookings page' })
  @ApiOkResponse({ type: ApiResponse(BookingsAnalyticsResponseDto) })
  @Permissions(Permission.ANALYTICS_LOCATION_READ)
  @Post('bookings/analytics')
  async analytics(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: BookingsAnalyticsRequestDto,
  ): Promise<BaseResponseDto<BookingsAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new BookingsAnalyticsResponseDto(widgets));
  }
}

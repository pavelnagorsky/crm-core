import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { BookingsAnalyticsService } from './bookings-analytics.service.js';
import { BookingsAnalyticsRequestDto } from './dto/bookings-analytics-request.dto.js';
import { BookingsAnalyticsResponseDto } from './dto/bookings-analytics-response.dto.js';
import { RBAC } from '../../business/decorators/rbac.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../../shared/dto/base-response.dto.js';

@ApiTags('Bookings')
@Controller('businesses/:businessId')
export class BookingsAnalyticsController {
  constructor(private readonly analyticsService: BookingsAnalyticsService) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the bookings page' })
  @ApiOkResponse({ type: ApiResponse(BookingsAnalyticsResponseDto) })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Post('bookings/analytics')
  async analytics(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: BookingsAnalyticsRequestDto,
  ): Promise<BaseResponseDto<BookingsAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(businessId, dto);
    return BaseResponseDto.success(new BookingsAnalyticsResponseDto(widgets));
  }
}

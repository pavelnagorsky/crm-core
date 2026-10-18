import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Permission } from '../../../access/enums/permission.enum.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { StaffAccessService } from '../../../staff/services/staff-access.service.js';
import { BookingsAnalyticsRequestDto } from '../dto/bookings-analytics-request.dto.js';
import { BookingsAnalyticsResponseDto } from '../dto/bookings-analytics-response.dto.js';
import { BookingsAnalyticsService } from '../services/bookings-analytics.service.js';

@ApiTags('Bookings')
@Controller('locations/:locationId')
export class BookingsAnalyticsController {
  constructor(
    private readonly analyticsService: BookingsAnalyticsService,
    private readonly access: StaffAccessService,
  ) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the bookings page' })
  @ApiOkResponse({ type: ApiResponse(BookingsAnalyticsResponseDto) })
  @Permissions([
    Permission.ANALYTICS_LOCATION_READ,
    Permission.BOOKING_READ_OWN,
  ])
  @Post('bookings/analytics')
  async analytics(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: BookingsAnalyticsRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingsAnalyticsResponseDto>> {
    const staffId = await this.access.resolveStaffId(
      token,
      locationId,
      Permission.ANALYTICS_LOCATION_READ,
      Permission.BOOKING_READ_OWN,
    );
    const widgets = await this.analyticsService.getWidgets(
      locationId,
      staffId ? { ...dto, staffId } : dto,
    );
    return BaseResponseDto.success(new BookingsAnalyticsResponseDto(widgets));
  }
}

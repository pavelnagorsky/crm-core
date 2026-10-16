import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServicesAnalyticsService } from './services-analytics.service.js';
import { ServicesAnalyticsRequestDto } from './dto/services-analytics-request.dto.js';
import { ServicesAnalyticsResponseDto } from './dto/services-analytics-response.dto.js';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';

@ApiTags('Services')
@Controller('locations/:locationId')
export class ServicesAnalyticsController {
  constructor(private readonly analyticsService: ServicesAnalyticsService) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the services page' })
  @ApiOkResponse({ type: ApiResponse(ServicesAnalyticsResponseDto) })
  @Permissions(Permission.ANALYTICS_LOCATION_READ)
  @Post('services/analytics')
  async analytics(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ServicesAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ServicesAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new ServicesAnalyticsResponseDto(widgets));
  }
}

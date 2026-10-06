import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { ServicesAnalyticsService } from './services-analytics.service.js';
import { ServicesAnalyticsRequestDto } from './dto/services-analytics-request.dto.js';
import { ServicesAnalyticsResponseDto } from './dto/services-analytics-response.dto.js';
import { LocationRBAC } from '../../auth/decorators/location-rbac.decorator.js';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';

@ApiTags('Services')
@Controller('locations/:locationId')
export class ServicesAnalyticsController {
  constructor(private readonly analyticsService: ServicesAnalyticsService) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the services page' })
  @ApiOkResponse({ type: ApiResponse(ServicesAnalyticsResponseDto) })
  @LocationRBAC(BusinessRole.OWNER)
  @Post('services/analytics')
  async analytics(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ServicesAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ServicesAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new ServicesAnalyticsResponseDto(widgets));
  }
}

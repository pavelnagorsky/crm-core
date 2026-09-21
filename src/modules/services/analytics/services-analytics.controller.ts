import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { ServicesAnalyticsService } from './services-analytics.service.js';
import { ServicesAnalyticsRequestDto } from './dto/services-analytics-request.dto.js';
import { ServicesAnalyticsResponseDto } from './dto/services-analytics-response.dto.js';
import { RBAC } from '../../business/decorators/rbac.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../../shared/dto/base-response.dto.js';

@ApiTags('Services')
@Controller('businesses/:businessId')
export class ServicesAnalyticsController {
  constructor(private readonly analyticsService: ServicesAnalyticsService) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the services page' })
  @ApiOkResponse({ type: ApiResponse(ServicesAnalyticsResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Post('services/analytics')
  async analytics(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: ServicesAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ServicesAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(businessId, dto);
    return BaseResponseDto.success(new ServicesAnalyticsResponseDto(widgets));
  }
}

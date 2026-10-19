import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Read } from '../../../access/utils/permission.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { ServicesAnalyticsRequestDto } from '../dto/services-analytics-request.dto.js';
import { ServicesAnalyticsResponseDto } from '../dto/services-analytics-response.dto.js';
import { ServicesAnalyticsService } from '../services/services-analytics.service.js';

@ApiTags('Services')
@Controller('locations/:locationId')
export class ServicesAnalyticsController {
  constructor(private readonly analyticsService: ServicesAnalyticsService) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the services page' })
  @ApiOkResponse({ type: ApiResponse(ServicesAnalyticsResponseDto) })
  @Permissions(Read(Claim.ANALYTICS_LOCATION))
  @Post('services/analytics')
  async analytics(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ServicesAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ServicesAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new ServicesAnalyticsResponseDto(widgets));
  }
}

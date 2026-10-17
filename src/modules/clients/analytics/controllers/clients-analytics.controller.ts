import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Permission } from '../../../access/enums/permission.enum.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { ClientsAnalyticsRequestDto } from '../dto/clients-analytics-request.dto.js';
import { ClientsAnalyticsResponseDto } from '../dto/clients-analytics-response.dto.js';
import { ClientsAnalyticsService } from '../services/clients-analytics.service.js';

@ApiTags('Clients')
@Controller('brands/:brandId/clients')
export class ClientsAnalyticsController {
  constructor(private readonly analyticsService: ClientsAnalyticsService) {}

  @ApiOperation({
    summary: 'Fetch client-base widgets for the clients page',
    description:
      'New clients and revenue per client are metric cards with a sparkline. Repeat visit share is a new/returning series whose metric is the returning percentage. Dormant clients is a recency breakdown whose metric counts clients silent for 60 days or more.',
  })
  @ApiOkResponse({ type: ApiResponse(ClientsAnalyticsResponseDto) })
  @Permissions(Permission.ANALYTICS_BRAND_READ)
  @Post('analytics')
  async analytics(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: ClientsAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ClientsAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(brandId, dto);
    return BaseResponseDto.success(new ClientsAnalyticsResponseDto(widgets));
  }
}

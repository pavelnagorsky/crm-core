import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { RBAC } from '../../business/decorators/rbac.decorator.js';
import { ClientsAnalyticsService } from './clients-analytics.service.js';
import { ClientsAnalyticsRequestDto } from './dto/clients-analytics-request.dto.js';
import { ClientsAnalyticsResponseDto } from './dto/clients-analytics-response.dto.js';

@ApiTags('Clients')
@Controller('businesses/:businessId')
export class ClientsAnalyticsController {
  constructor(private readonly analyticsService: ClientsAnalyticsService) {}

  @ApiOperation({
    summary: 'Fetch client-base widgets for the clients page',
    description:
      'New clients and revenue per client are metric cards with a sparkline. Repeat visit share is a new/returning series whose metric is the returning percentage. Dormant clients is a recency breakdown whose metric counts clients silent for 60 days or more.',
  })
  @ApiOkResponse({ type: ApiResponse(ClientsAnalyticsResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Post('clients/analytics')
  async analytics(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: ClientsAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ClientsAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(businessId, dto);
    return BaseResponseDto.success(new ClientsAnalyticsResponseDto(widgets));
  }
}

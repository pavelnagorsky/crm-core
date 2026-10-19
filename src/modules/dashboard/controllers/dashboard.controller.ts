import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read } from '../../access/utils/permission.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { DashboardFacade } from '../dashboard.facade.js';
import { DashboardWidgetsRequestDto } from '../dto/dashboard-widgets-request.dto.js';
import { DashboardWidgetsResponseDto } from '../dto/dashboard-widgets-response.dto.js';

@ApiTags('Dashboard')
@Controller('locations/:locationId/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardFacade) {}

  @ApiOperation({ summary: 'Fetch a set of dashboard widgets by key' })
  @ApiOkResponse({ type: ApiResponse(DashboardWidgetsResponseDto) })
  @Permissions(Read(Claim.ANALYTICS_LOCATION))
  @Post('widgets')
  async getWidgets(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: DashboardWidgetsRequestDto,
  ): Promise<BaseResponseDto<DashboardWidgetsResponseDto>> {
    const widgets = await this.dashboardService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new DashboardWidgetsResponseDto(widgets));
  }
}

import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service.js';
import { DashboardWidgetsRequestDto } from './dto/dashboard-widgets-request.dto.js';
import { DashboardWidgetsResponseDto } from './dto/dashboard-widgets-response.dto.js';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { Permission } from '../access/enums/permission.enum.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';

@ApiTags('Dashboard')
@Controller('locations/:locationId/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({ summary: 'Fetch a set of dashboard widgets by key' })
  @ApiOkResponse({ type: ApiResponse(DashboardWidgetsResponseDto) })
  @Permissions(Permission.ANALYTICS_LOCATION_READ)
  @Post('widgets')
  async getWidgets(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: DashboardWidgetsRequestDto,
  ): Promise<BaseResponseDto<DashboardWidgetsResponseDto>> {
    const widgets = await this.dashboardService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new DashboardWidgetsResponseDto(widgets));
  }
}

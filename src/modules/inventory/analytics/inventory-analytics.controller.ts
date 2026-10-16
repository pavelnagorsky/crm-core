import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { InventoryKpiQueryDto } from './dto/inventory-kpi-query.dto.js';
import { InventoryKpiResponseDto } from './dto/inventory-kpi-response.dto.js';
import { InventoryAnalyticsService } from './inventory-analytics.service.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';

@ApiTags('Inventory')
@Controller('locations/:locationId/inventory')
export class InventoryAnalyticsController {
  constructor(private readonly analyticsService: InventoryAnalyticsService) {}

  @ApiOperation({ summary: 'Get inventory KPI summary' })
  @ApiOkResponse({ type: ApiResponse(InventoryKpiResponseDto) })
  @Permissions(Permission.ANALYTICS_LOCATION_READ, Permission.INVENTORY_READ)
  @Get('kpi')
  async getKpi(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryKpiQueryDto,
  ): Promise<BaseResponseDto<InventoryKpiResponseDto>> {
    return BaseResponseDto.success(
      InventoryKpiResponseDto.fromEntity(
        await this.analyticsService.getKpi(locationId, dto),
      ),
    );
  }
}

import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Read } from '../../../access/utils/permission.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { InventoryKpiQueryDto } from '../dto/inventory-kpi-query.dto.js';
import { InventoryKpiResponseDto } from '../dto/inventory-kpi-response.dto.js';
import { InventoryAnalyticsService } from '../services/inventory-analytics.service.js';

@ApiTags('Inventory')
@Controller('locations/:locationId/inventory')
export class InventoryAnalyticsController {
  constructor(private readonly analyticsService: InventoryAnalyticsService) {}

  @ApiOperation({ summary: 'Get inventory KPI summary' })
  @ApiOkResponse({ type: ApiResponse(InventoryKpiResponseDto) })
  @Permissions(Read(Claim.ANALYTICS_LOCATION), Read(Claim.INVENTORY))
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

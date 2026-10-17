import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Permission } from '../../../access/enums/permission.enum.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { StaffWidgetsRequestDto } from '../dto/staff-widgets-request.dto.js';
import { StaffWidgetsResponseDto } from '../dto/staff-widgets-response.dto.js';
import { StaffKpiService } from '../services/staff-kpi.service.js';

@ApiTags('Staff')
@Controller('locations/:locationId/staff')
export class StaffKpiController {
  constructor(private readonly staffKpiService: StaffKpiService) {}

  @ApiOperation({
    summary: 'Get staff management KPI cards, sharing the /search filters',
  })
  @ApiOkResponse({ type: ApiResponse(StaffWidgetsResponseDto) })
  @Permissions(Permission.ANALYTICS_LOCATION_READ)
  @Get('widgets')
  async getWidgets(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: StaffWidgetsRequestDto,
  ): Promise<BaseResponseDto<StaffWidgetsResponseDto>> {
    const cards = await this.staffKpiService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new StaffWidgetsResponseDto(cards));
  }
}

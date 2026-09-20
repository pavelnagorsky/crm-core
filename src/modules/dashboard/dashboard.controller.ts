import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { DashboardService } from './dashboard.service.js';
import { DashboardWidgetsRequestDto } from './dto/dashboard-widgets-request.dto.js';
import { DashboardWidgetsResponseDto } from './dto/dashboard-widgets-response.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto, assertBusinessRole } from '../auth/dto/token-payload.dto.js';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({ summary: 'Fetch a set of dashboard widgets by key' })
  @ApiOkResponse({ type: ApiResponse(DashboardWidgetsResponseDto) })
  @Auth()
  @Post('widgets')
  async getWidgets(
    @Body() dto: DashboardWidgetsRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<DashboardWidgetsResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER);
    const widgets = await this.dashboardService.getWidgets(dto);
    return BaseResponseDto.success(new DashboardWidgetsResponseDto(widgets));
  }
}

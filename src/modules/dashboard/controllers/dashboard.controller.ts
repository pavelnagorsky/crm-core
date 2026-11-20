import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read } from '../../access/utils/permission.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { DashboardFacade } from '../dashboard.facade.js';
import { DashboardWidgetsRequestDto } from '../dto/dashboard-widgets-request.dto.js';
import { DashboardWidgetsResponseDto } from '../dto/dashboard-widgets-response.dto.js';
import { FinanceSummaryRequestDto } from '../dto/finance-summary-request.dto.js';
import { FinanceSummaryResponseDto } from '../dto/finance-summary-response.dto.js';
import { FinanceSummaryService } from '../services/finance-summary.service.js';

@ApiTags('Dashboard')
@Controller('locations/:locationId/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardFacade,
    private readonly financeSummary: FinanceSummaryService,
  ) {}

  @ApiOperation({
    summary: 'Money of a period by payment method and unpaid visits and sales',
    description:
      'Days are inclusive, in the location timezone. money: payments minus refunds whose money changed hands in the period (occurredAt), per method; refunds: the refunds already subtracted. notSpecified: closed visits (by start) and active sales (by date) of the period with something due and no active payment record; the first 20 by time, count and amount of all. The whole location, no staff filter.',
  })
  @ApiOkResponse({ type: ApiResponse(FinanceSummaryResponseDto) })
  @ApiBadRequestResponse({
    description:
      'DASHBOARD_CUSTOM_RANGE_INVALID: from after to. FINANCE_SUMMARY_RANGE_TOO_LONG: more than 62 days',
  })
  @Permissions(Read(Claim.ANALYTICS_LOCATION))
  @Get('finance-summary')
  async getFinanceSummary(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: FinanceSummaryRequestDto,
  ): Promise<BaseResponseDto<FinanceSummaryResponseDto>> {
    return BaseResponseDto.success(
      FinanceSummaryResponseDto.fromSummary(
        await this.financeSummary.summary(locationId, dto),
      ),
    );
  }

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

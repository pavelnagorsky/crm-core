import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { StaffKpiService } from './staff-kpi.service.js';
import { StaffWidgetsRequestDto } from './dto/staff-widgets-request.dto.js';
import { StaffWidgetsResponseDto } from './dto/staff-widgets-response.dto.js';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto, assertBusinessRole } from '../../auth/dto/token-payload.dto.js';

@ApiTags('Staff')
@Controller('staff')
export class StaffKpiController {
  constructor(private readonly staffKpiService: StaffKpiService) {}

  @ApiOperation({ summary: 'Get staff management KPI cards, sharing the /search filters' })
  @ApiOkResponse({ type: ApiResponse(StaffWidgetsResponseDto) })
  @Auth()
  @Get('widgets')
  async getWidgets(
    @Query() dto: StaffWidgetsRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffWidgetsResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const cards = await this.staffKpiService.getWidgets(dto.businessId, dto);
    return BaseResponseDto.success(new StaffWidgetsResponseDto(cards));
  }
}

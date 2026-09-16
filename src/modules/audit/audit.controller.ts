import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { AuditService } from './audit.service.js';
import { AuditHistoryRequestDto } from './dto/audit-history-request.dto.js';
import { AuditHistoryResponseDto } from './dto/audit-history-response.dto.js';
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';

@ApiTags('Audit')
@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @ApiOperation({ summary: 'Get audit history for an entity' })
  @ApiOkResponse({ type: ApiResponse(AuditHistoryResponseDto) })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('businesses/:businessId/audit')
  async getHistory(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: AuditHistoryRequestDto,
  ): Promise<BaseResponseDto<AuditHistoryResponseDto>> {
    const { items, totalItems } = await this.auditService.getHistory(businessId, dto);
    return BaseResponseDto.success(
      new AuditHistoryResponseDto(items, dto.page, dto.pageSize, totalItems),
    );
  }
}

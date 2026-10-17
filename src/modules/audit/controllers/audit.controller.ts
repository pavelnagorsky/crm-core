import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { AuditHistoryRequestDto } from '../dto/audit-history-request.dto.js';
import { AuditHistoryResponseDto } from '../dto/audit-history-response.dto.js';
import { AuditService } from '../services/audit.service.js';

@ApiTags('Audit')
@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @ApiOperation({ summary: 'Get audit history for an entity' })
  @ApiOkResponse({ type: ApiResponse(AuditHistoryResponseDto) })
  @Permissions(Permission.AUDIT_BRAND_READ)
  @Get('brands/:brandId/audit')
  async getBrandHistory(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: AuditHistoryRequestDto,
  ): Promise<BaseResponseDto<AuditHistoryResponseDto>> {
    const { items, totalItems } = await this.auditService.getBrandHistory(
      brandId,
      dto,
    );
    return BaseResponseDto.success(
      new AuditHistoryResponseDto(items, dto.page, dto.pageSize, totalItems),
    );
  }

  @ApiOperation({ summary: 'Get location audit history for an entity' })
  @ApiOkResponse({ type: ApiResponse(AuditHistoryResponseDto) })
  @Permissions(Permission.AUDIT_LOCATION_READ)
  @Get('locations/:locationId/audit')
  async getLocationHistory(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: AuditHistoryRequestDto,
  ): Promise<BaseResponseDto<AuditHistoryResponseDto>> {
    const { items, totalItems } = await this.auditService.getLocationHistory(
      locationId,
      dto,
    );
    return BaseResponseDto.success(
      new AuditHistoryResponseDto(items, dto.page, dto.pageSize, totalItems),
    );
  }
}

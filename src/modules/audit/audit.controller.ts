import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { AuditService } from './audit.service.js';
import { AuditHistoryRequestDto } from './dto/audit-history-request.dto.js';
import { AuditHistoryResponseDto } from './dto/audit-history-response.dto.js';
import { BrandRBAC } from '../auth/decorators/brand-rbac.decorator.js';
import { LocationRBAC } from '../auth/decorators/location-rbac.decorator.js';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';

@ApiTags('Audit')
@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @ApiOperation({ summary: 'Get audit history for an entity' })
  @ApiOkResponse({ type: ApiResponse(AuditHistoryResponseDto) })
  @BrandRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
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
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
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

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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Read, Write } from '../../../access/utils/permission.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../../shared/dto/id-response.dto.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { StaffAccessService } from '../../../staff/services/staff-access.service.js';
import { CreateManualEarningDto } from '../dto/create-manual-earning.dto.js';
import { RecordProductSaleDto } from '../dto/record-product-sale.dto.js';
import { StaffEarningResponseDto } from '../dto/staff-earning-response.dto.js';
import { StaffEarningSearchRequestDto } from '../dto/staff-earning-search-request.dto.js';
import { StaffEarningSearchResponseDto } from '../dto/staff-earning-search-response.dto.js';
import { StaffEarningsByStaffRequestDto } from '../dto/staff-earnings-by-staff-request.dto.js';
import { StaffEarningsService } from '../services/staff-earnings.service.js';

@ApiTags('Payroll')
@Controller()
export class StaffEarningsController {
  constructor(
    private readonly earnings: StaffEarningsService,
    private readonly access: StaffAccessService,
  ) {}

  @ApiOperation({ summary: 'Search staff earnings' })
  @ApiOkResponse({ type: ApiResponse(StaffEarningSearchResponseDto) })
  @Permissions([Read(Claim.PAYROLL), Read(Claim.PAYROLL_OWN)])
  @Get('locations/:locationId/payroll/earnings')
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: StaffEarningSearchRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningSearchResponseDto>> {
    const staffId = await this.access.resolveStaffId(
      token,
      locationId,
      Read(Claim.PAYROLL),
      Read(Claim.PAYROLL_OWN),
    );
    const { items, totalItems } = await this.earnings.search(
      locationId,
      staffId ? { ...dto, staffId } : dto,
    );
    return BaseResponseDto.success(
      new StaffEarningSearchResponseDto(
        items.map(StaffEarningResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'List earnings for a staff member' })
  @ApiOkResponse({ type: ApiResponse(StaffEarningSearchResponseDto) })
  @Permissions([Read(Claim.PAYROLL), Read(Claim.PAYROLL_OWN)])
  @Get('locations/:locationId/staff/:id/earnings')
  async listForStaff(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: StaffEarningsByStaffRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningSearchResponseDto>> {
    await this.access.assertStaff(
      token,
      locationId,
      id,
      Read(Claim.PAYROLL),
      Read(Claim.PAYROLL_OWN),
    );
    const { items, totalItems } = await this.earnings.search(locationId, {
      ...dto,
      staffId: id,
    });
    return BaseResponseDto.success(
      new StaffEarningSearchResponseDto(
        items.map(StaffEarningResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Add a manual bonus, deduction, or correction' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Permissions(Write(Claim.PAYROLL))
  @Post('locations/:locationId/staff/:id/earnings')
  async createManual(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateManualEarningDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const earning = await this.earnings.createManual(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: earning.id });
  }

  @ApiOperation({ summary: 'Record a product sale commission (no inventory)' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Write(Claim.PAYROLL))
  @Post('locations/:locationId/payroll/product-sales')
  async recordProductSale(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: RecordProductSaleDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const earning = await this.earnings.recordProductSale(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: earning.id });
  }
}

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto, assertBusinessRole } from '../../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { ApiResponse, BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { StaffService } from '../../staff/staff.service.js';
import { CreateManualEarningDto } from './dto/create-manual-earning.dto.js';
import { RecordProductSaleDto } from './dto/record-product-sale.dto.js';
import { StaffEarningsByStaffRequestDto } from './dto/staff-earnings-by-staff-request.dto.js';
import { StaffEarningResponseDto } from './dto/staff-earning-response.dto.js';
import { StaffEarningSearchRequestDto } from './dto/staff-earning-search-request.dto.js';
import { StaffEarningSearchResponseDto } from './dto/staff-earning-search-response.dto.js';
import { StaffEarningsService } from './staff-earnings.service.js';

@ApiTags('Payroll')
@Controller()
export class StaffEarningsController {
  constructor(
    private readonly earnings: StaffEarningsService,
    private readonly staffService: StaffService,
  ) {}

  @ApiOperation({ summary: 'Search staff earnings' })
  @ApiOkResponse({ type: ApiResponse(StaffEarningSearchResponseDto) })
  @Auth()
  @Get('payroll/earnings')
  async search(
    @Query() dto: StaffEarningSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningSearchResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { items, totalItems } = await this.earnings.search(dto.businessId, dto);
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
  @Auth()
  @Get('staff/:id/earnings')
  async listForStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: StaffEarningsByStaffRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningSearchResponseDto>> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(tokenPayload, staff.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { items, totalItems } = await this.earnings.search(staff.businessId, {
      ...dto,
      businessId: staff.businessId,
      staffId: id,
    } as StaffEarningSearchRequestDto);
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
  @ApiCreatedResponse({ type: ApiResponse(StaffEarningResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Post('staff/:id/earnings')
  async createManual(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateManualEarningDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningResponseDto>> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(tokenPayload, staff.businessId, BusinessRole.OWNER);
    const earning = await this.earnings.createManual(id, dto, auditActorFromToken(tokenPayload, staff.businessId));
    return BaseResponseDto.success(StaffEarningResponseDto.fromEntity(earning));
  }

  @ApiOperation({ summary: 'Record a product sale commission (no inventory)' })
  @ApiCreatedResponse({ type: ApiResponse(StaffEarningResponseDto) })
  @Auth()
  @Post('payroll/product-sales')
  async recordProductSale(
    @Body() dto: RecordProductSaleDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER);
    const earning = await this.earnings.recordProductSale(
      dto.businessId,
      dto,
      auditActorFromToken(tokenPayload, dto.businessId),
    );
    return BaseResponseDto.success(StaffEarningResponseDto.fromEntity(earning));
  }
}

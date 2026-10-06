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
import { BusinessRole } from '@prisma/client';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { assertLocationRole } from '../../auth/guards/assert-location-role.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
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
  constructor(private readonly earnings: StaffEarningsService) {}

  @ApiOperation({ summary: 'Search staff earnings' })
  @ApiOkResponse({ type: ApiResponse(StaffEarningSearchResponseDto) })
  @Auth()
  @Get('locations/:locationId/payroll/earnings')
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: StaffEarningSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningSearchResponseDto>> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const { items, totalItems } = await this.earnings.search(
      locationId,
      dto,
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
  @Auth()
  @Get('locations/:locationId/staff/:id/earnings')
  async listForStaff(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: StaffEarningsByStaffRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningSearchResponseDto>> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
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
  @ApiCreatedResponse({ type: ApiResponse(StaffEarningResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Post('locations/:locationId/staff/:id/earnings')
  async createManual(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateManualEarningDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningResponseDto>> {
    assertLocationRole(tokenPayload, locationId, BusinessRole.OWNER);
    const earning = await this.earnings.createManual(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(StaffEarningResponseDto.fromEntity(earning));
  }

  @ApiOperation({ summary: 'Record a product sale commission (no inventory)' })
  @ApiCreatedResponse({ type: ApiResponse(StaffEarningResponseDto) })
  @Auth()
  @Post('locations/:locationId/payroll/product-sales')
  async recordProductSale(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: RecordProductSaleDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningResponseDto>> {
    assertLocationRole(tokenPayload, locationId, BusinessRole.OWNER);
    const earning = await this.earnings.recordProductSale(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(StaffEarningResponseDto.fromEntity(earning));
  }
}

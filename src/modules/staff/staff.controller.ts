import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { StaffService } from './staff.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffResponseDto } from './dto/staff-response.dto.js';
import { PublicStaffDto } from './dto/public-staff.dto.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
import { StaffSearchResponseDto } from './dto/staff-search-response.dto.js';
import { GetShiftsRequestDto } from './dto/get-shifts-request.dto.js';
import { ReplaceShiftsRequestDto } from './dto/replace-shifts-request.dto.js';
import { ShiftsResponseDto } from './dto/shifts-response.dto.js';
import { ShiftItemDto } from './dto/shift-item.dto.js';
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { ApiResponse, ApiResponseArray, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';

@ApiTags('Staff')
@Controller('businesses/:businessId/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @ApiOperation({ summary: 'List active staff members (public)' })
  @ApiOkResponse({ type: ApiResponseArray(PublicStaffDto) })
  @ApiQuery({ name: 'serviceId', required: false, type: String, description: 'Filter by service ID' })
  @Get('public/staff')
  async listPublic(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query('serviceId', new ParseUUIDPipe({ optional: true })) serviceId?: string,
  ): Promise<BaseResponseDto<PublicStaffDto[]>> {
    const staff = await this.staffService.listPublic(businessId, serviceId);
    return BaseResponseDto.success(staff.map(PublicStaffDto.fromEntity));
  }

  @ApiOperation({ summary: 'Create a staff member' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Post()
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateStaffDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const staff = await this.staffService.create(businessId, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: staff.id });
  }

  @ApiOperation({ summary: 'Update a staff member' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @RBAC(BusinessRole.OWNER)
  @Put(':id')
  async update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const staff = await this.staffService.update(businessId, id, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: staff.id });
  }

  @ApiOperation({ summary: 'Search staff members' })
  @ApiOkResponse({ type: ApiResponse(StaffSearchResponseDto) })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('search')
  async search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: StaffSearchRequestDto,
  ): Promise<BaseResponseDto<StaffSearchResponseDto>> {
    const { items, totalItems } = await this.staffService.search(businessId, dto);
    return BaseResponseDto.success(
      new StaffSearchResponseDto(
        items.map(StaffResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get staff member by ID' })
  @ApiOkResponse({ type: ApiResponse(StaffResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<StaffResponseDto>> {
    const staff = await this.staffService.findById(id);
    return BaseResponseDto.success(StaffResponseDto.fromEntity(staff));
  }

  @ApiOperation({ summary: 'Delete a staff member' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.staffService.delete(businessId, id, auditActorFromToken(tokenPayload, businessId));
  }

  @ApiOperation({ summary: 'Get shifts for a staff member within a date range' })
  @ApiOkResponse({ type: ApiResponse(ShiftsResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @RBAC(BusinessRole.OWNER)
  @Get(':staffId/shifts')
  async getShifts(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Query() dto: GetShiftsRequestDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    await this.staffService.findById(staffId);
    const shifts = await this.staffService.getShifts(staffId, dto);
    return BaseResponseDto.success(
      new ShiftsResponseDto(dto.from, dto.to, shifts.map(ShiftItemDto.fromEntity)),
    );
  }

  @ApiOperation({ summary: 'Replace shifts for a staff member within a date range' })
  @ApiOkResponse({ type: ApiResponse(ShiftsResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @RBAC(BusinessRole.OWNER)
  @Put(':staffId/shifts')
  async replaceShifts(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: ReplaceShiftsRequestDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    await this.staffService.findById(staffId);
    const shifts = await this.staffService.replaceShifts(staffId, dto);
    return BaseResponseDto.success(
      new ShiftsResponseDto(dto.from, dto.to, shifts.map(ShiftItemDto.fromEntity)),
    );
  }
}

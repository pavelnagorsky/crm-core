import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { ApiResponse, ApiResponseArray, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { BusinessService } from '../business/business.service.js';

@ApiTags('Staff')
@Controller('businesses/:businessId/staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly businessService: BusinessService,
  ) {}

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
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @Auth()
  @Post()
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: CreateStaffDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const staff = await this.staffService.create(businessId, payload, dto);
    return BaseResponseDto.success({ id: staff.id });
  }

  @ApiOperation({ summary: 'Update a staff member' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Put(':id')
  async update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: UpdateStaffDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const staff = await this.staffService.update(id, payload, dto);
    return BaseResponseDto.success({ id: staff.id });
  }

  @ApiOperation({ summary: 'Search staff members' })
  @ApiOkResponse({ type: ApiResponse(StaffSearchResponseDto) })
  @ApiForbiddenResponse({ description: 'Not a member of this business' })
  @Auth()
  @Get('search')
  async search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Query() dto: StaffSearchRequestDto,
  ): Promise<BaseResponseDto<StaffSearchResponseDto>> {
    const { items, totalItems } = await this.staffService.search(businessId, payload, dto);
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
  @Auth()
  @Get(':id')
  async findById(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<StaffResponseDto>> {
    const staff = await this.staffService.findById(id);
    return BaseResponseDto.success(StaffResponseDto.fromEntity(staff));
  }

  @ApiOperation({ summary: 'Delete a staff member' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Delete(':id')
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<void> {
    await this.staffService.delete(id, payload);
  }

  @ApiOperation({ summary: 'Get shifts for a staff member within a date range' })
  @ApiOkResponse({ type: ApiResponse(ShiftsResponseDto) })
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Get(':staffId/shifts')
  async getShifts(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Query() dto: GetShiftsRequestDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    await this.businessService.assertOwner(businessId, payload);
    await this.staffService.findById(staffId);
    const shifts = await this.staffService.getShifts(staffId, dto);
    return BaseResponseDto.success(
      new ShiftsResponseDto(dto.from, dto.to, shifts.map(ShiftItemDto.fromEntity)),
    );
  }

  @ApiOperation({ summary: 'Replace shifts for a staff member within a date range' })
  @ApiOkResponse({ type: ApiResponse(ShiftsResponseDto) })
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Put(':staffId/shifts')
  async replaceShifts(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: ReplaceShiftsRequestDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    await this.businessService.assertOwner(businessId, payload);
    await this.staffService.findById(staffId);
    const shifts = await this.staffService.replaceShifts(staffId, dto);
    return BaseResponseDto.success(
      new ShiftsResponseDto(dto.from, dto.to, shifts.map(ShiftItemDto.fromEntity)),
    );
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { StaffStatusCountResponseDto } from './dto/staff-status-count-response.dto.js';
import { ChangeStaffStatusDto } from './dto/change-staff-status.dto.js';
import { StaffService } from './staff.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffResponseDto } from './dto/staff-response.dto.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
import { StaffSearchResponseDto } from './dto/staff-search-response.dto.js';
import { StaffExportRequestDto } from './dto/staff-export-request.dto.js';
import { StaffExportService } from './services/staff-export.service.js';
import { XlsxService } from '../../shared/xlsx/xlsx.service.js';
import { GetShiftsRequestDto } from './dto/get-shifts-request.dto.js';
import { ReplaceShiftsRequestDto } from './dto/replace-shifts-request.dto.js';
import { ShiftsResponseDto } from './dto/shifts-response.dto.js';
import { ShiftItemDto } from './dto/shift-item.dto.js';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { Permission } from '../access/enums/permission.enum.js';
import { assertPermission } from '../access/utils/assert-permission.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';

@ApiTags('Staff')
@Controller()
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly staffExportService: StaffExportService,
  ) {}

  @ApiOperation({ summary: 'Create a staff member' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.STAFF_MANAGE)
  @Post('locations/:locationId/staff')
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateStaffDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const staff = await this.staffService.create(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: staff.id });
  }

  @ApiOperation({ summary: 'Update a staff member' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Permissions(Permission.STAFF_MANAGE)
  @Put('locations/:locationId/staff/:id')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const updated = await this.staffService.update(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: updated.id });
  }

  @ApiOperation({ summary: 'Get staff count per status' })
  @ApiOkResponse({ type: ApiResponseArray(StaffStatusCountResponseDto) })
  @Permissions(Permission.STAFF_READ)
  @Get('locations/:locationId/staff/status-counts')
  async getStatusCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<StaffStatusCountResponseDto[]>> {
    const counts = await this.staffService.getStatusCounts(locationId);
    return BaseResponseDto.success(counts);
  }

  @ApiOperation({ summary: 'Export staff members as XLSX' })
  @ApiProduces(XlsxService.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Permission.STAFF_EXPORT)
  @Get('locations/:locationId/staff/export')
  async export(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: StaffExportRequestDto,
    @Res({ passthrough: true }) res: any,
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.staffExportService.stream(
      locationId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxService.mimeType });
  }

  @ApiOperation({ summary: 'Get staff member by ID' })
  @ApiOkResponse({ type: ApiResponse(StaffResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Permissions(Permission.STAFF_READ)
  @Get('locations/:locationId/staff/:id')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<StaffResponseDto>> {
    const staff = await this.staffService.findWithServiceCountInLocation(
      locationId,
      id,
    );
    return BaseResponseDto.success(StaffResponseDto.fromEntity(staff));
  }

  @ApiOperation({ summary: 'Search staff members' })
  @ApiOkResponse({ type: ApiResponse(StaffSearchResponseDto) })
  @Permissions(Permission.STAFF_READ)
  @Get('locations/:locationId/staff')
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: StaffSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffSearchResponseDto>> {
    if (dto.isExport)
      assertPermission(tokenPayload, Permission.STAFF_EXPORT, locationId);
    const { items, totalItems } = await this.staffService.search(
      locationId,
      dto,
    );
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

  @ApiOperation({ summary: 'Change status of a staff member' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @ApiConflictResponse({ description: 'Staff member already has this status' })
  @Permissions(Permission.STAFF_MANAGE)
  @Patch('locations/:locationId/staff/:id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStaffStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.staffService.changeStatus(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
  }

  @ApiOperation({ summary: 'Delete a staff member' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @ApiConflictResponse({ description: 'Staff member has associated bookings' })
  @Permissions(Permission.STAFF_MANAGE)
  @Delete('locations/:locationId/staff/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.staffService.delete(
      locationId,
      id,
      auditActorFromToken(tokenPayload, locationId),
    );
  }

  @ApiOperation({
    summary: 'Get shifts for a staff member within a date range',
  })
  @ApiOkResponse({ type: ApiResponse(ShiftsResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Permissions(Permission.STAFF_READ)
  @Get('locations/:locationId/staff/:id/shifts')
  async getShifts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: GetShiftsRequestDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    const shifts = await this.staffService.getShifts(locationId, id, dto);
    return BaseResponseDto.success(
      new ShiftsResponseDto(
        dto.from,
        dto.to,
        shifts.map(ShiftItemDto.fromEntity),
      ),
    );
  }

  @ApiOperation({
    summary: 'Replace shifts for a staff member within a date range',
  })
  @ApiOkResponse({ type: ApiResponse(ShiftsResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Permissions(Permission.STAFF_MANAGE)
  @Put('locations/:locationId/staff/:id/shifts')
  async replaceShifts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceShiftsRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    const shifts = await this.staffService.replaceShifts(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(
      new ShiftsResponseDto(
        dto.from,
        dto.to,
        shifts.map(ShiftItemDto.fromEntity),
      ),
    );
  }
}

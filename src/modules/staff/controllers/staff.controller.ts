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
import type { Response } from 'express';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { ChangeStaffStatusDto } from '../dto/change-staff-status.dto.js';
import { CreateStaffDto } from '../dto/create-staff.dto.js';
import { GetShiftsRequestDto } from '../dto/get-shifts-request.dto.js';
import { ReplaceShiftsRequestDto } from '../dto/replace-shifts-request.dto.js';
import { ShiftItemDto } from '../dto/shift-item.dto.js';
import { ShiftsResponseDto } from '../dto/shifts-response.dto.js';
import { StaffExportRequestDto } from '../export/dto/staff-export-request.dto.js';
import { StaffResponseDto } from '../dto/staff-response.dto.js';
import { StaffSearchRequestDto } from '../dto/staff-search-request.dto.js';
import { StaffSearchResponseDto } from '../dto/staff-search-response.dto.js';
import { StaffStatusCountResponseDto } from '../dto/staff-status-count-response.dto.js';
import { StaffDirectoryItemDto } from '../dto/staff-directory-item.dto.js';
import { UpdateStaffDto } from '../dto/update-staff.dto.js';
import { StaffExportService } from '../export/services/staff-export.service.js';
import { StaffAccessService } from '../services/staff-access.service.js';
import { StaffService } from '../services/staff.service.js';

@ApiTags('Staff')
@Controller()
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly staffExportService: StaffExportService,
    private readonly access: StaffAccessService,
  ) {}

  @ApiOperation({
    summary: 'List staff names for the booking calendar and reassignment',
  })
  @ApiOkResponse({ type: ApiResponseArray(StaffDirectoryItemDto) })
  @Permissions([Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)])
  @Get('locations/:locationId/staff/directory')
  async directory(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<StaffDirectoryItemDto[]>> {
    const staff = await this.staffService.listInLocation(locationId);
    return BaseResponseDto.success(staff.map(StaffDirectoryItemDto.fromEntity));
  }

  @ApiOperation({ summary: 'Create a staff member' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Write(Claim.STAFF))
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
  @Permissions(Write(Claim.STAFF))
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
  @Permissions(Read(Claim.STAFF))
  @Get('locations/:locationId/staff/status-counts')
  async getStatusCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<StaffStatusCountResponseDto[]>> {
    const counts = await this.staffService.getStatusCounts(locationId);
    return BaseResponseDto.success(counts);
  }

  @ApiOperation({ summary: 'Export staff members as XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Read(Claim.STAFF_EXPORT))
  @Get('locations/:locationId/staff/export')
  async export(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: StaffExportRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.staffExportService.stream(
      locationId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({ summary: 'Get staff member by ID' })
  @ApiOkResponse({ type: ApiResponse(StaffResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Permissions([Read(Claim.STAFF), Read(Claim.STAFF_OWN)])
  @Get('locations/:locationId/staff/:id')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffResponseDto>> {
    await this.access.assertStaff(
      token,
      locationId,
      id,
      Read(Claim.STAFF),
      Read(Claim.STAFF_OWN),
    );
    const staff = await this.staffService.findWithServiceCountInLocation(
      locationId,
      id,
    );
    return BaseResponseDto.success(StaffResponseDto.fromEntity(staff));
  }

  @ApiOperation({ summary: 'Search staff members' })
  @ApiOkResponse({ type: ApiResponse(StaffSearchResponseDto) })
  @Permissions(Read(Claim.STAFF))
  @Get('locations/:locationId/staff')
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: StaffSearchRequestDto,
  ): Promise<BaseResponseDto<StaffSearchResponseDto>> {
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
  @Permissions(Write(Claim.STAFF))
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
  @Permissions(Write(Claim.STAFF))
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
  @Permissions([Read(Claim.STAFF), Read(Claim.STAFF_OWN)])
  @Get('locations/:locationId/staff/:id/shifts')
  async getShifts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: GetShiftsRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    await this.access.assertStaff(
      token,
      locationId,
      id,
      Read(Claim.STAFF),
      Read(Claim.STAFF_OWN),
    );
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
  @Permissions(Write(Claim.STAFF))
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

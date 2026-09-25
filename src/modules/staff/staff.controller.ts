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
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { StaffStatusCountResponseDto } from './dto/staff-status-count-response.dto.js';
import { ChangeStaffStatusDto } from './dto/change-staff-status.dto.js';
import { BusinessRole } from '@prisma/client';
import { StaffService } from './staff.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import { InvitationResponseDto } from './dto/invitation-response.dto.js';
import { StaffResponseDto } from './dto/staff-response.dto.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
import { StaffSearchResponseDto } from './dto/staff-search-response.dto.js';
import { StaffExportRequestDto } from './dto/staff-export-request.dto.js';
import { StaffExportService } from './staff-export.service.js';
import { XlsxService } from '../../shared/xlsx/xlsx.service.js';
import { GetShiftsRequestDto } from './dto/get-shifts-request.dto.js';
import { ReplaceShiftsRequestDto } from './dto/replace-shifts-request.dto.js';
import { ShiftsResponseDto } from './dto/shifts-response.dto.js';
import { ShiftItemDto } from './dto/shift-item.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import {
  TokenPayloadDto,
  assertBusinessRole,
} from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';

@ApiTags('Staff')
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly staffExportService: StaffExportService,
  ) {}

  @ApiOperation({ summary: 'Create a staff member' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Auth()
  @Post()
  async create(
    @Body() dto: CreateStaffDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER);
    const staff = await this.staffService.create(
      dto.businessId,
      dto,
      auditActorFromToken(tokenPayload, dto.businessId),
    );
    return BaseResponseDto.success({ id: staff.id });
  }

  @ApiOperation({ summary: 'Update a staff member' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(tokenPayload, staff.businessId, BusinessRole.OWNER);
    const updated = await this.staffService.update(
      staff.businessId,
      id,
      dto,
      auditActorFromToken(tokenPayload, staff.businessId),
    );
    return BaseResponseDto.success({ id: updated.id });
  }

  @ApiOperation({ summary: 'Get staff count per status' })
  @ApiOkResponse({ type: ApiResponseArray(StaffStatusCountResponseDto) })
  @Auth()
  @Get('status-counts')
  async getStatusCounts(
    @Query('businessId', ParseUUIDPipe) businessId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffStatusCountResponseDto[]>> {
    assertBusinessRole(tokenPayload, businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const counts = await this.staffService.getStatusCounts(businessId);
    return BaseResponseDto.success(counts);
  }

  @ApiOperation({ summary: 'Export staff members as XLSX' })
  @ApiProduces(XlsxService.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Auth()
  @Get('export')
  async export(
    @Query() dto: StaffExportRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
    @Res({ passthrough: true }) res: any,
  ): Promise<StreamableFile> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { stream, filename } = await this.staffExportService.stream(dto.businessId, dto);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxService.mimeType });
  }

  @ApiOperation({ summary: 'Get staff member by ID' })
  @ApiOkResponse({ type: ApiResponse(StaffResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffResponseDto>> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(
      tokenPayload,
      staff.businessId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    return BaseResponseDto.success(StaffResponseDto.fromEntity(staff));
  }

  @ApiOperation({ summary: 'Search staff members' })
  @ApiOkResponse({ type: ApiResponse(StaffSearchResponseDto) })
  @Auth()
  @Get()
  async search(
    @Query() dto: StaffSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffSearchResponseDto>> {
    assertBusinessRole(
      tokenPayload,
      dto.businessId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const { items, totalItems } = await this.staffService.search(
      dto.businessId,
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
  @Auth()
  @Patch(':id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStaffStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(tokenPayload, staff.businessId, BusinessRole.OWNER);
    await this.staffService.changeStatus(
      staff.businessId,
      id,
      dto,
      auditActorFromToken(tokenPayload, staff.businessId),
    );
  }

  @ApiOperation({ summary: 'Delete a staff member' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @ApiConflictResponse({ description: 'Staff member has associated bookings' })
  @Auth()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(tokenPayload, staff.businessId, BusinessRole.OWNER);
    await this.staffService.delete(staff.businessId, id);
  }

  @ApiOperation({
    summary: 'Get shifts for a staff member within a date range',
  })
  @ApiOkResponse({ type: ApiResponse(ShiftsResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Get(':id/shifts')
  async getShifts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: GetShiftsRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(
      tokenPayload,
      staff.businessId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const shifts = await this.staffService.getShifts(id, dto);
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
  @Auth()
  @Put(':id/shifts')
  async replaceShifts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceShiftsRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ShiftsResponseDto>> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(tokenPayload, staff.businessId, BusinessRole.OWNER);
    const shifts = await this.staffService.replaceShifts(
      id,
      dto,
      auditActorFromToken(tokenPayload, staff.businessId),
    );
    return BaseResponseDto.success(
      new ShiftsResponseDto(
        dto.from,
        dto.to,
        shifts.map(ShiftItemDto.fromEntity),
      ),
    );
  }

  @ApiOperation({
    summary: 'Create an invitation token for a staff member (owner only)',
  })
  @ApiCreatedResponse({ type: ApiResponse(InvitationResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @ApiConflictResponse({
    description: 'Staff member is already linked to a user account',
  })
  @Auth()
  @Post(':id/invitations')
  async createInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInvitationDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<InvitationResponseDto>> {
    const staff = await this.staffService.findById(id);
    assertBusinessRole(tokenPayload, staff.businessId, BusinessRole.OWNER);
    const result = await this.staffService.createInvitation(id, dto);
    return BaseResponseDto.success(result);
  }

  @ApiOperation({ summary: 'Accept a staff invitation (authenticated user)' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Invitation not found or already used' })
  @ApiGoneResponse({ description: 'Invitation has expired' })
  @ApiConflictResponse({ description: 'Already a member of this business' })
  @Auth()
  @Post('invitations/accept')
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const invitation = await this.staffService.acceptInvitation(
      tokenPayload.sub,
      dto.token,
    );
    return BaseResponseDto.success({ id: invitation.staffId });
  }
}

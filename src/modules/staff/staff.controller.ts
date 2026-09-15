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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StaffService } from './staff.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffResponseDto } from './dto/staff-response.dto.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
import { StaffSearchResponseDto } from './dto/staff-search-response.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';

@ApiTags('Staff')
@Controller('businesses/:businessId/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

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
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    await this.staffService.delete(id, payload);
    return BaseResponseDto.success({ id });
  }
}

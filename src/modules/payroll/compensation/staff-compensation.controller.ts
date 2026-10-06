import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
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
  ApiResponseArray,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { StaffService } from '../../staff/staff.service.js';
import { CompensationPlanResponseDto } from './dto/compensation-plan-response.dto.js';
import { ReplaceCompensationPlanDto } from './dto/replace-compensation-plan.dto.js';
import { StaffCompensationService } from './staff-compensation.service.js';

@ApiTags('Payroll')
@Controller('locations/:locationId/staff')
export class StaffCompensationController {
  constructor(
    private readonly compensation: StaffCompensationService,
    private readonly staffService: StaffService,
  ) {}

  @ApiOperation({ summary: 'Get current compensation plan for a staff member' })
  @ApiOkResponse({ type: ApiResponse(CompensationPlanResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Auth()
  @Get(':id/compensation/current')
  async current(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<CompensationPlanResponseDto | null>> {
    const staff = await this.staffService.findById(id);
    if (staff.locationId !== locationId)
      throw new NotFoundException('Staff member not found');
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const plan = await this.compensation.findCurrent(id);
    return BaseResponseDto.success(
      plan ? CompensationPlanResponseDto.fromEntity(plan) : null,
    );
  }

  @ApiOperation({ summary: 'Get compensation plan history for a staff member' })
  @ApiOkResponse({ type: ApiResponseArray(CompensationPlanResponseDto) })
  @Auth()
  @Get(':id/compensation')
  async history(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<CompensationPlanResponseDto[]>> {
    const staff = await this.staffService.findById(id);
    if (staff.locationId !== locationId)
      throw new NotFoundException('Staff member not found');
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.STAFF,
    );
    const plans = await this.compensation.listHistory(id);
    return BaseResponseDto.success(
      plans.map(CompensationPlanResponseDto.fromEntity),
    );
  }

  @ApiOperation({
    summary: 'Create a new compensation plan version (owner only)',
    description:
      'Closes the current version and opens a new one from effectiveFrom. Omit serviceRates to keep previous service overrides; send [] to clear them.',
  })
  @ApiOkResponse({ type: ApiResponse(CompensationPlanResponseDto) })
  @Auth()
  @Put(':id/compensation')
  async replace(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceCompensationPlanDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<CompensationPlanResponseDto>> {
    const staff = await this.staffService.findById(id);
    if (staff.locationId !== locationId)
      throw new NotFoundException('Staff member not found');
    assertLocationRole(tokenPayload, locationId, BusinessRole.OWNER);
    const plan = await this.compensation.replace(
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(
      CompensationPlanResponseDto.fromEntity(plan),
    );
  }
}

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
import { Claim } from '../../../access/enums/claim.enum.js';
import { Read, Write } from '../../../access/utils/permission.js';
import { ApiResponseArray } from '../../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../../shared/dto/id-response.dto.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { CompensationPlanResponseDto } from '../dto/compensation-plan-response.dto.js';
import { ReplaceCompensationPlanDto } from '../dto/replace-compensation-plan.dto.js';
import { StaffCompensationService } from '../services/staff-compensation.service.js';

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
  @Permissions(Read(Claim.PAYROLL))
  @Get(':id/compensation/current')
  async current(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<CompensationPlanResponseDto | null>> {
    const staff = await this.staffService.findById(id);
    if (staff.locationId !== locationId)
      throw new NotFoundException('Staff member not found');
    const plan = await this.compensation.findCurrent(id);
    return BaseResponseDto.success(
      plan ? CompensationPlanResponseDto.fromEntity(plan) : null,
    );
  }

  @ApiOperation({ summary: 'Get compensation plan history for a staff member' })
  @ApiOkResponse({ type: ApiResponseArray(CompensationPlanResponseDto) })
  @Permissions(Read(Claim.PAYROLL))
  @Get(':id/compensation')
  async history(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<CompensationPlanResponseDto[]>> {
    const staff = await this.staffService.findById(id);
    if (staff.locationId !== locationId)
      throw new NotFoundException('Staff member not found');
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
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Write(Claim.PAYROLL))
  @Put(':id/compensation')
  async replace(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceCompensationPlanDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const staff = await this.staffService.findById(id);
    if (staff.locationId !== locationId)
      throw new NotFoundException('Staff member not found');
    const plan = await this.compensation.replace(
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: plan.id });
  }
}

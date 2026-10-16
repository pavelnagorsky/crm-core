import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { InvitationTokenDto } from '../access/dto/invitation-token.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { CreateInvitationDto } from '../staff/dto/create-invitation.dto.js';
import { InvitationResponseDto } from '../staff/dto/invitation-response.dto.js';
import { AccessManagementService } from './access-management.service.js';
import { InvitationRateLimiter } from './services/invitation-rate-limiter.js';

@ApiTags('Staff')
@Controller()
export class LegacyStaffInvitationsController {
  constructor(
    private readonly management: AccessManagementService,
    private readonly rateLimiter: InvitationRateLimiter,
  ) {}

  @Auth()
  @Post('locations/:locationId/staff/:id/invitations')
  @ApiCreatedResponse({ type: ApiResponse(InvitationResponseDto) })
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) staffId: string,
    @Body() dto: CreateInvitationDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<InvitationResponseDto>> {
    const result = await this.management.legacyInvite(
      token,
      locationId,
      staffId,
      dto.email,
    );
    return BaseResponseDto.success({ token: result.token });
  }

  @Auth()
  @Post('staff/invitations/accept')
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  async accept(
    @Body() dto: InvitationTokenDto,
    @TokenPayload() token: TokenPayloadDto,
    @Req() request: Request,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    this.rateLimiter.assertAllowed(request.ip ?? 'unknown');
    const invitation = await this.management.accept(token, dto.token);
    return BaseResponseDto.success({
      id: invitation.grants[0]?.staffId ?? invitation.id,
    });
  }
}

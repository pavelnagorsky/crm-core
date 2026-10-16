import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import type { Request } from 'express';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { AccessInvitationLinkDto } from '../access/dto/access-invitation-link.dto.js';
import { AccessInvitationResponseDto } from '../access/dto/access-invitation-response.dto.js';
import { AccessInvitationSearchResponseDto } from '../access/dto/access-invitation-search-response.dto.js';
import { AccessMembershipResponseDto } from '../access/dto/access-membership-response.dto.js';
import { AccessMembershipSearchResponseDto } from '../access/dto/access-membership-search-response.dto.js';
import { AccessPolicyEntryDto } from '../access/dto/access-policy-entry.dto.js';
import { AccessPolicyResponseDto } from '../access/dto/access-policy-response.dto.js';
import { AccessSearchRequestDto } from '../access/dto/access-search-request.dto.js';
import { ChangeMembershipDto } from '../access/dto/change-membership.dto.js';
import { CreateAccessInvitationDto } from '../access/dto/create-access-invitation.dto.js';
import { InvitationPreviewDto } from '../access/dto/invitation-preview.dto.js';
import { InvitationTokenDto } from '../access/dto/invitation-token.dto.js';
import { ReplaceOwnerDto } from '../access/dto/replace-owner.dto.js';
import { UpdatePolicyDto } from '../access/dto/update-policy.dto.js';
import { UserAccessResponseDto } from '../access/dto/user-access-response.dto.js';
import { AccessAdministrationService } from '../access/services/access-administration.service.js';
import { Permission } from '../access/enums/permission.enum.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { StaffService } from '../staff/staff.service.js';
import { AccessManagementService } from './access-management.service.js';
import { InvitationRateLimiter } from './services/invitation-rate-limiter.js';

@ApiTags('Access')
@Controller()
export class AccessManagementController {
  constructor(
    private readonly management: AccessManagementService,
    private readonly administration: AccessAdministrationService,
    private readonly staff: StaffService,
    private readonly rateLimiter: InvitationRateLimiter,
  ) {}

  @Auth()
  @Get('users/me/access')
  @ApiOkResponse({ type: ApiResponse(UserAccessResponseDto) })
  async me(
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<UserAccessResponseDto>> {
    return BaseResponseDto.success(
      UserAccessResponseDto.fromToken(
        token,
        await this.staff.accessProfilesForUser(token.sub),
      ),
    );
  }

  @Permissions(Permission.ACCESS_POLICY_MANAGE)
  @Get([
    'brands/:brandId/access/policies',
    'locations/:locationId/access/policies',
  ])
  @ApiOkResponse({ type: ApiResponse(AccessPolicyResponseDto) })
  async policies(
    @Param('brandId') brand?: string,
    @Param('locationId') location?: string,
  ): Promise<BaseResponseDto<AccessPolicyResponseDto>> {
    const scope = await this.management.scope(brand, location);
    return BaseResponseDto.success(
      await this.policyResponse(scope.brandId, scope.locationId),
    );
  }

  @Auth()
  @Patch([
    'brands/:brandId/access/policies',
    'locations/:locationId/access/policies',
  ])
  @ApiOkResponse({ type: ApiResponse(AccessPolicyResponseDto) })
  async updatePolicy(
    @TokenPayload() token: TokenPayloadDto,
    @Body() dto: UpdatePolicyDto,
    @Param('brandId') brand?: string,
    @Param('locationId') location?: string,
  ): Promise<BaseResponseDto<AccessPolicyResponseDto>> {
    const scope = await this.management.scope(brand, location);
    await this.management.updatePolicy(
      token,
      scope.brandId,
      scope.locationId,
      dto,
    );
    return BaseResponseDto.success(
      await this.policyResponse(scope.brandId, scope.locationId),
    );
  }

  @Auth()
  @Delete([
    'brands/:brandId/access/policies/:role/overrides',
    'locations/:locationId/access/policies/:role/overrides',
  ])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async resetPolicy(
    @TokenPayload() token: TokenPayloadDto,
    @Param('role', new ParseEnumPipe(BusinessRole)) role: BusinessRole,
    @Headers('if-match') version: string,
    @Param('brandId') brand?: string,
    @Param('locationId') location?: string,
  ): Promise<void> {
    const scope = await this.management.scope(brand, location);
    await this.management.resetPolicy(
      token,
      scope.brandId,
      scope.locationId,
      role,
      this.version(version),
    );
  }

  @Auth()
  @Get([
    'brands/:brandId/access/memberships',
    'locations/:locationId/access/memberships',
  ])
  @ApiOkResponse({ type: ApiResponse(AccessMembershipSearchResponseDto) })
  async members(
    @TokenPayload() token: TokenPayloadDto,
    @Query() dto: AccessSearchRequestDto,
    @Param('brandId') brand?: string,
    @Param('locationId') location?: string,
  ): Promise<BaseResponseDto<AccessMembershipSearchResponseDto>> {
    const scope = await this.management.scope(brand, location);
    const rows = await this.management.members(
      token,
      scope.brandId,
      scope.locationId,
    );
    const policy = await this.administration.policy(
      scope.brandId,
      scope.locationId,
    );
    return BaseResponseDto.success(
      new AccessMembershipSearchResponseDto(
        this.page(rows, dto).map(AccessMembershipResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        rows.length,
        policy.version,
        dto.isExport,
      ),
    );
  }

  @Auth()
  @Patch([
    'brands/:brandId/access/memberships/:membershipId',
    'locations/:locationId/access/memberships/:membershipId',
  ])
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  async changeMember(
    @TokenPayload() token: TokenPayloadDto,
    @Body() dto: ChangeMembershipDto,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Param('brandId') brand?: string,
    @Param('locationId') location?: string,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const scope = await this.management.scope(brand, location);
    const row = await this.management.changeMember(
      token,
      scope.brandId,
      scope.locationId,
      id,
      dto,
      dto.expectedVersion,
    );
    return BaseResponseDto.success({ id: row.id });
  }

  @Auth()
  @Delete([
    'brands/:brandId/access/memberships/:membershipId',
    'locations/:locationId/access/memberships/:membershipId',
  ])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async revokeMember(
    @TokenPayload() token: TokenPayloadDto,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string,
    @Param('brandId') brand?: string,
    @Param('locationId') location?: string,
  ): Promise<void> {
    const scope = await this.management.scope(brand, location);
    await this.management.changeMember(
      token,
      scope.brandId,
      scope.locationId,
      id,
      null,
      this.version(version),
    );
  }

  @Auth()
  @Post('brands/:brandId/access/invitations')
  @ApiCreatedResponse({ type: ApiResponse(AccessInvitationLinkDto) })
  async createInvitation(
    @TokenPayload() token: TokenPayloadDto,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateAccessInvitationDto,
  ): Promise<BaseResponseDto<AccessInvitationLinkDto>> {
    return BaseResponseDto.success(
      this.invitationLink(
        await this.management.createInvitation(token, brandId, dto),
      ),
    );
  }

  @Auth()
  @Get('brands/:brandId/access/invitations')
  @ApiOkResponse({ type: ApiResponse(AccessInvitationSearchResponseDto) })
  async invitations(
    @TokenPayload() token: TokenPayloadDto,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: AccessSearchRequestDto,
  ): Promise<BaseResponseDto<AccessInvitationSearchResponseDto>> {
    const rows = await this.management.invitations(
      token,
      brandId,
      dto.locationId,
    );
    return BaseResponseDto.success(
      new AccessInvitationSearchResponseDto(
        this.page(rows, dto).map(AccessInvitationResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        rows.length,
        dto.isExport,
      ),
    );
  }

  @Auth()
  @Post('brands/:brandId/access/invitations/:invitationId/reissue')
  @ApiCreatedResponse({ type: ApiResponse(AccessInvitationLinkDto) })
  async reissue(
    @TokenPayload() token: TokenPayloadDto,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('invitationId', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<AccessInvitationLinkDto>> {
    return BaseResponseDto.success(
      this.invitationLink(await this.management.reissue(token, brandId, id)),
    );
  }

  @Auth()
  @Delete('brands/:brandId/access/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async revokeInvitation(
    @TokenPayload() token: TokenPayloadDto,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('invitationId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.management.revoke(token, brandId, id);
  }

  @Post('access/invitations/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ApiResponse(InvitationPreviewDto) })
  async preview(
    @Body() dto: InvitationTokenDto,
    @Req() request: Request,
  ): Promise<BaseResponseDto<InvitationPreviewDto>> {
    this.rateLimiter.assertAllowed(request.ip ?? 'unknown');
    return BaseResponseDto.success(
      Object.assign(
        new InvitationPreviewDto(),
        await this.management.preview(dto.token),
      ),
    );
  }

  @Auth()
  @Post('access/invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ApiResponse(AccessInvitationResponseDto) })
  async accept(
    @TokenPayload() token: TokenPayloadDto,
    @Body() dto: InvitationTokenDto,
    @Req() request: Request,
  ): Promise<BaseResponseDto<AccessInvitationResponseDto>> {
    this.rateLimiter.assertAllowed(request.ip ?? 'unknown');
    return BaseResponseDto.success(
      AccessInvitationResponseDto.fromEntity(
        await this.management.accept(token, dto.token),
      ),
    );
  }

  @Auth()
  @Post('admin/brands/:brandId/owner-replacement')
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  async replaceOwner(
    @TokenPayload() token: TokenPayloadDto,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: ReplaceOwnerDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    await this.management.replaceOwner(
      token,
      brandId,
      dto.previousUserId,
      dto.newUserId,
      dto.reason,
    );
    return BaseResponseDto.success({ id: brandId });
  }

  private async policyResponse(brandId: string, locationId?: string) {
    const policy = await this.administration.describePolicy(
      brandId,
      locationId,
    );
    return Object.assign(new AccessPolicyResponseDto(), {
      version: policy.version,
      entries: policy.entries.map((row) =>
        Object.assign(new AccessPolicyEntryDto(), row),
      ),
    });
  }
  private invitationLink(
    result: Awaited<ReturnType<AccessManagementService['createInvitation']>>,
  ) {
    return Object.assign(new AccessInvitationLinkDto(), {
      invitation: AccessInvitationResponseDto.fromEntity(result.invitation),
      token: result.token,
      url: this.management.link(result.token),
    });
  }
  private version(value: string) {
    const numeric = Number(value?.replaceAll('"', ''));
    if (!value || !Number.isSafeInteger(numeric) || numeric < 0)
      throw new BadRequestException('If-Match must contain the access version');
    return numeric;
  }
  private page<T>(rows: T[], dto: AccessSearchRequestDto): T[] {
    return dto.isExport
      ? rows
      : rows.slice((dto.page - 1) * dto.pageSize, dto.page * dto.pageSize);
  }
}

import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessRole, Prisma, UserRole } from '@prisma/client';
import { IFrontendConfig } from '../../config/interfaces/frontend-config.interface.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { ChangeMembershipDto } from '../access/dto/change-membership.dto.js';
import { CreateAccessInvitationDto } from '../access/dto/create-access-invitation.dto.js';
import { UpdatePolicyDto } from '../access/dto/update-policy.dto.js';
import { AccessService } from '../access/services/access.service.js';
import { AccessAdministrationService } from '../access/services/access-administration.service.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { AuthService } from '../auth/services/auth.service.js';
import { TokenEpochRegistryService } from '../auth/services/token-epoch-registry.service.js';
import { BrandService } from '../brand/services/brand.service.js';
import { LocationService } from '../location/services/location.service.js';
import { AccessInvitationNotification } from '../notifications/messages/access-invitation.notification.js';
import { NotificationsService } from '../notifications/services/notifications.service.js';
import { StaffService } from '../staff/services/staff.service.js';
import { UserService } from '../user/services/user.service.js';
import { AccessChangeOptions } from './interfaces/access-change-options.interface.js';

@Injectable()
export class AccessManagementFacade {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
    private readonly administration: AccessAdministrationService,
    private readonly auth: AuthService,
    private readonly epochs: TokenEpochRegistryService,
    private readonly staff: StaffService,
    private readonly locations: LocationService,
    private readonly brands: BrandService,
    private readonly users: UserService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async scope(brandId?: string, locationId?: string) {
    if (locationId) {
      const location = await this.locations.findById(locationId);
      if (brandId && brandId !== location.brandId)
        throw new NotFoundException('Location not found');
      return { brandId: location.brandId, locationId };
    }
    if (!brandId) throw new NotFoundException('Brand not found');
    await this.brands.findById(brandId);
    return { brandId, locationId: undefined };
  }

  private async withAccessLock<T>(
    token: TokenPayloadDto,
    brandId: string,
    operation: (
      token: TokenPayloadDto,
      tx: Prisma.TransactionClient,
    ) => Promise<T>,
    options: AccessChangeOptions = {},
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        if (!(await this.brands.acquireActiveOperationLock(brandId, tx)))
          throw new NotFoundException('Brand not found');
        await this.access.lockBrand(brandId, tx);
        const current = await this.auth.resolveTokenPayload(token.sub, tx);
        const result = await operation(current, tx);
        const affected = options.invalidateBrandTokens
          ? [...(await this.access.affectedUserIds(brandId, tx)), token.sub]
          : (options.affectedUserIds ?? []);
        if (affected.length) await this.epochs.bumpMany(affected, tx);
        return result;
      },
      { timeout: 15000 },
    );
  }

  updatePolicy(
    token: TokenPayloadDto,
    brandId: string,
    locationId: string | undefined,
    dto: UpdatePolicyDto,
  ) {
    return this.withAccessLock(
      token,
      brandId,
      (actor, tx) =>
        this.administration.changePolicy(
          actor,
          brandId,
          locationId,
          dto.expectedVersion,
          dto.changes,
          tx,
        ),
      { invalidateBrandTokens: true },
    );
  }

  resetPolicy(
    token: TokenPayloadDto,
    brandId: string,
    locationId: string | undefined,
    role: BusinessRole,
    version: number,
  ) {
    return this.withAccessLock(
      token,
      brandId,
      (actor, tx) =>
        this.administration.resetPolicy(
          actor,
          brandId,
          locationId,
          role,
          version,
          tx,
        ),
      { invalidateBrandTokens: true },
    );
  }

  members(token: TokenPayloadDto, brandId: string, locationId?: string) {
    return this.administration.memberships(token, brandId, locationId);
  }

  async changeMember(
    token: TokenPayloadDto,
    brandId: string,
    locationId: string | undefined,
    id: string,
    dto: ChangeMembershipDto | null,
    version: number,
  ) {
    const affected: string[] = [];
    return this.withAccessLock(
      token,
      brandId,
      async (actor, tx) => {
        const membership = await this.administration.membership(
          brandId,
          locationId,
          id,
          tx,
        );
        await this.protectAdmin(actor.sub, membership.userId, tx);
        affected.push(membership.userId);
        const result = await this.administration.changeMembership(
          actor,
          brandId,
          locationId,
          id,
          dto?.role ?? null,
          version,
          tx,
        );
        if (dto?.role === BusinessRole.STAFF) {
          if (!locationId || !dto.staffId)
            throw new AppException(
              ErrorCode.ACCESS_GRANT_INVALID,
              HttpStatus.BAD_REQUEST,
            );
          await this.staff.bindAccessProfile(
            locationId,
            dto.staffId,
            membership.userId,
            tx,
          );
        }
        if (!dto && locationId && membership.role === BusinessRole.STAFF)
          await this.staff.releaseAccessProfile(
            locationId,
            membership.userId,
            tx,
          );
        return result;
      },
      { affectedUserIds: affected },
    );
  }

  async createInvitation(
    token: TokenPayloadDto,
    brandId: string,
    dto: CreateAccessInvitationDto,
  ) {
    return this.withAccessLock(token, brandId, async (actor, tx) => {
      for (const grant of dto.grants) {
        if (grant.locationId) {
          const location = await this.locations.findById(grant.locationId, tx);
          if (location.brandId !== brandId)
            throw new AppException(
              ErrorCode.ACCESS_GRANT_INVALID,
              HttpStatus.BAD_REQUEST,
            );
        }
        if (grant.staffId && grant.locationId)
          await this.staff.resolveInvitationProfile(
            grant.locationId,
            grant.staffId,
            tx,
          );
      }
      return this.administration.createInvitation(
        actor,
        brandId,
        dto.grants,
        tx,
      );
    });
  }

  invitations(token: TokenPayloadDto, brandId: string, locationId?: string) {
    return this.administration.invitations(token, brandId, locationId);
  }

  invitationLink(token: TokenPayloadDto, brandId: string, id: string) {
    return this.withAccessLock(token, brandId, (actor, tx) =>
      this.administration.invitationLink(actor, brandId, id, tx),
    );
  }

  async sendInvitationEmail(
    token: TokenPayloadDto,
    brandId: string,
    id: string,
    email: string,
  ): Promise<void> {
    const result = await this.invitationLink(token, brandId, id);
    const brand = await this.brands.findById(brandId);
    await this.notifications.sendEmail(
      new AccessInvitationNotification(
        email,
        this.link(result.token),
        brand.name,
      ),
    );
  }

  revoke(token: TokenPayloadDto, brandId: string, id: string) {
    return this.withAccessLock(token, brandId, (actor, tx) =>
      this.administration.revokeInvitation(actor, brandId, id, tx),
    );
  }

  async preview(rawToken: string) {
    const invitation = await this.administration.invitationByToken(rawToken);
    if (!invitation)
      throw new AppException(
        ErrorCode.ACCESS_INVITATION_INVALID,
        HttpStatus.NOT_FOUND,
      );
    this.administration.assertPending(invitation);
    const brand = await this.brands.findById(invitation.brandId);
    const issuer = await this.auth.resolveTokenPayload(invitation.issuerId);
    const grants = [];
    for (const grant of invitation.grants) {
      this.administration.assertRole(
        issuer,
        invitation.brandId,
        grant.role,
        grant.locationId ?? undefined,
      );
      const location = grant.locationId
        ? await this.locations.findById(grant.locationId)
        : null;
      grants.push({ role: grant.role, locationName: location?.name ?? null });
    }
    return { brandName: brand.name, expiresAt: invitation.expiresAt, grants };
  }

  async accept(token: TokenPayloadDto, rawToken: string) {
    const found = await this.administration.invitationByToken(rawToken);
    if (!found)
      throw new AppException(
        ErrorCode.ACCESS_INVITATION_INVALID,
        HttpStatus.NOT_FOUND,
      );
    const affectedUserIds: string[] = [];
    return this.withAccessLock(
      token,
      found.brandId,
      async (actor, tx) => {
        const invitation = await this.administration.invitationByToken(
          rawToken,
          tx,
        );
        if (!invitation)
          throw new AppException(
            ErrorCode.ACCESS_INVITATION_INVALID,
            HttpStatus.NOT_FOUND,
          );
        if (invitation.acceptedById === actor.sub) return invitation;
        this.administration.assertPending(invitation);
        const issuer = await this.auth.resolveTokenPayload(
          invitation.issuerId,
          tx,
        );
        await this.protectAdmin(issuer.sub, actor.sub, tx);
        for (const grant of invitation.grants) {
          this.administration.assertRole(
            issuer,
            invitation.brandId,
            grant.role,
            grant.locationId ?? undefined,
          );
          if (grant.locationId) {
            const location = await this.locations.findById(
              grant.locationId,
              tx,
            );
            if (location.brandId !== invitation.brandId)
              throw new AppException(
                ErrorCode.ACCESS_GRANT_INVALID,
                HttpStatus.CONFLICT,
              );
          }
          if (grant.role === BusinessRole.STAFF) {
            if (!grant.locationId || !grant.staffId)
              throw new AppException(
                ErrorCode.ACCESS_GRANT_INVALID,
                HttpStatus.CONFLICT,
              );
            await this.staff.bindAccessProfile(
              grant.locationId,
              grant.staffId,
              actor.sub,
              tx,
            );
          }
          await this.administration.grantMembership(
            invitation.brandId,
            actor.sub,
            grant.role,
            grant.locationId,
            tx,
          );
        }
        const accepted = await this.administration.markAccepted(
          invitation.brandId,
          invitation.id,
          actor.sub,
          tx,
        );
        affectedUserIds.push(actor.sub);
        return accepted;
      },
      { affectedUserIds },
    );
  }

  async replaceOwner(
    token: TokenPayloadDto,
    brandId: string,
    previousUserId: string,
    newUserId: string,
    reason: string,
  ) {
    return this.withAccessLock(
      token,
      brandId,
      async (actor, tx) => {
        if (actor.role !== UserRole.ADMIN) throw new ForbiddenException();
        await this.protectAdmin(actor.sub, previousUserId, tx);
        await this.protectAdmin(actor.sub, newUserId, tx);
        await this.users.findById(newUserId, tx);
        await this.administration.replaceOwner(
          brandId,
          actor.sub,
          previousUserId,
          newUserId,
          reason,
          tx,
        );
      },
      { affectedUserIds: [previousUserId, newUserId] },
    );
  }

  link(token: string) {
    return `${this.config.get<IFrontendConfig>('frontend')!.domain}/invitation#token=${token}`;
  }

  private async protectAdmin(
    actorId: string,
    targetId: string,
    tx: Prisma.TransactionClient,
  ) {
    const target = await this.users.findById(targetId, tx);
    if (target.role === UserRole.ADMIN && target.id !== actorId)
      throw new ForbiddenException(
        'Platform administrators cannot be managed through business access',
      );
  }
}

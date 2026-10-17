import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessRole, Prisma, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PermissionCalculator } from '../calculators/permission.calculator.js';
import { PERMISSION_REGISTRY } from '../constants/permission-registry.js';
import { InvitationGrantDto } from '../dto/invitation-grant.dto.js';
import { PermissionChangeDto } from '../dto/permission-change.dto.js';
import { AccessScope } from '../enums/access-scope.enum.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { PermissionValue } from '../enums/permission-value.enum.js';
import { Permission } from '../enums/permission.enum.js';
import { assertPermission, hasPermission } from '../utils/assert-permission.js';
import { AccessService } from './access.service.js';

@Injectable()
export class AccessAdministrationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
    private readonly compute: PermissionCalculator,
  ) {}

  rolePermission(role: BusinessRole): Permission {
    return {
      OWNER: Permission.ACCESS_OWNER_MANAGE,
      MANAGER: Permission.ACCESS_MANAGER_MANAGE,
      STAFF: Permission.ACCESS_STAFF_MANAGE,
    }[role];
  }

  assertRole(
    actor: TokenPayloadDto,
    brandId: string,
    role: BusinessRole,
    locationId?: string,
  ) {
    assertPermission(
      actor,
      this.rolePermission(role),
      locationId ?? brandId,
      !!locationId,
    );
  }

  async policy(
    brandId: string,
    locationId?: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const [state, brandOverrides, locationOverrides] = await Promise.all([
      tx.accessState.findUnique({ where: { brandId } }),
      tx.brandPermissionOverride.findMany({ where: { brandId } }),
      locationId
        ? tx.locationPermissionOverride.findMany({ where: { locationId } })
        : Promise.resolve([]),
    ]);
    return { version: state?.revision ?? 0, brandOverrides, locationOverrides };
  }

  async describePolicy(brandId: string, locationId?: string) {
    const policy = await this.policy(brandId, locationId);
    const entries = [BusinessRole.MANAGER, BusinessRole.STAFF].flatMap(
      (role) => {
        const inherited = this.compute.rolePermissions(
          role,
          policy.brandOverrides,
        );
        const effective = this.compute.rolePermissions(
          role,
          policy.brandOverrides,
          policy.locationOverrides,
        );
        return Object.values(Permission)
          .filter(
            (permission) =>
              PERMISSION_REGISTRY[permission].configurable.includes(role) &&
              permission !== Permission.FILE_BRAND_MANAGE &&
              (!locationId ||
                PERMISSION_REGISTRY[permission].scope ===
                  PermissionScope.LOCATION ||
                PERMISSION_REGISTRY[permission].scope ===
                  PermissionScope.BRAND_OR_LOCATION),
          )
          .map((permission) => {
            const definition = PERMISSION_REGISTRY[permission];
            const override = (
              locationId ? policy.locationOverrides : policy.brandOverrides
            ).find((row) => row.role === role && row.permission === permission);
            return {
              role,
              permission,
              defaultAllowed: definition.defaults.includes(role),
              inheritedAllowed: locationId
                ? inherited.has(permission)
                : definition.defaults.includes(role),
              override: override?.allowed ?? null,
              allowed: effective.has(permission),
              configurable: definition.configurable.includes(role),
              dependencies: [...definition.dependencies],
            };
          });
      },
    );
    return { version: policy.version, entries };
  }

  async changePolicy(
    actor: TokenPayloadDto,
    brandId: string,
    locationId: string | undefined,
    expectedVersion: number,
    changes: PermissionChangeDto[],
    tx: Prisma.TransactionClient,
  ) {
    assertPermission(
      actor,
      Permission.ACCESS_POLICY_MANAGE,
      locationId ?? brandId,
      !!locationId,
    );
    const policy = await this.policy(brandId, locationId, tx);
    this.assertVersion(policy.version, expectedVersion);
    const seen = new Set<string>();
    for (const change of changes) {
      const definition = PERMISSION_REGISTRY[change.permission];
      const key = `${change.role}:${change.permission}`;
      if (
        !definition ||
        !definition.configurable.includes(change.role) ||
        (locationId &&
          definition.scope !== PermissionScope.LOCATION &&
          definition.scope !== PermissionScope.BRAND_OR_LOCATION) ||
        seen.has(key)
      )
        this.invalidPolicy();
      seen.add(key);
      if (locationId) {
        const where = {
          locationId_role_permission: {
            locationId,
            role: change.role,
            permission: change.permission,
          },
        };
        if (change.value === PermissionValue.INHERIT)
          await tx.locationPermissionOverride.deleteMany({
            where: where.locationId_role_permission,
          });
        else
          await tx.locationPermissionOverride.upsert({
            where,
            create: {
              ...where.locationId_role_permission,
              allowed: change.value === PermissionValue.ALLOW,
            },
            update: { allowed: change.value === PermissionValue.ALLOW },
          });
      } else {
        const where = {
          brandId_role_permission: {
            brandId,
            role: change.role,
            permission: change.permission,
          },
        };
        if (change.value === PermissionValue.INHERIT)
          await tx.brandPermissionOverride.deleteMany({
            where: where.brandId_role_permission,
          });
        else
          await tx.brandPermissionOverride.upsert({
            where,
            create: {
              ...where.brandId_role_permission,
              allowed: change.value === PermissionValue.ALLOW,
            },
            update: { allowed: change.value === PermissionValue.ALLOW },
          });
      }
    }
    const updated = await this.policy(brandId, locationId, tx);
    for (const role of new Set(changes.map((row) => row.role))) {
      const resolved = this.compute.rolePermissions(
        role,
        updated.brandOverrides,
        updated.locationOverrides,
      );
      for (const [key, definition] of Object.entries(PERMISSION_REGISTRY)) {
        const permission = key as Permission;
        if (
          locationId &&
          definition.scope !== PermissionScope.LOCATION &&
          definition.scope !== PermissionScope.BRAND_OR_LOCATION
        )
          continue;
        const local = updated.locationOverrides.find(
          (row) => row.role === role && row.permission === key,
        );
        const brand = updated.brandOverrides.find(
          (row) => row.role === role && row.permission === key,
        );
        const enabled =
          local?.allowed ??
          brand?.allowed ??
          definition.defaults.includes(role);
        if (enabled && !resolved.has(permission)) this.invalidPolicy();
      }
    }
    await this.access.recordChange(
      brandId,
      actor.sub,
      'POLICY_CHANGED',
      locationId ?? brandId,
      { changes },
      tx,
      locationId,
    );
    return this.policy(brandId, locationId, tx);
  }

  async resetPolicy(
    actor: TokenPayloadDto,
    brandId: string,
    locationId: string | undefined,
    role: BusinessRole,
    expectedVersion: number,
    tx: Prisma.TransactionClient,
  ) {
    assertPermission(
      actor,
      Permission.ACCESS_POLICY_MANAGE,
      locationId ?? brandId,
      !!locationId,
    );
    if (role !== BusinessRole.MANAGER && role !== BusinessRole.STAFF)
      this.invalidPolicy();
    const policy = await this.policy(brandId, locationId, tx);
    this.assertVersion(policy.version, expectedVersion);
    if (locationId)
      await tx.locationPermissionOverride.deleteMany({
        where: { locationId, role },
      });
    else
      await tx.brandPermissionOverride.deleteMany({ where: { brandId, role } });
    await this.access.recordChange(
      brandId,
      actor.sub,
      'POLICY_RESET',
      locationId ?? brandId,
      { role },
      tx,
      locationId,
    );
  }

  async memberships(
    actor: TokenPayloadDto,
    brandId: string,
    locationId?: string,
  ) {
    const localIds = actor.locationMemberships
      .filter(
        (row) =>
          row.brandId === brandId &&
          (!locationId || row.locationId === locationId),
      )
      .map((row) => row.locationId);
    const [brands, locations] = await Promise.all([
      locationId
        ? Promise.resolve([])
        : this.db.brandMembership.findMany({
            where: { brandId },
            orderBy: { id: 'asc' },
          }),
      this.db.locationMembership.findMany({
        where: {
          location: { ...ACTIVE_LOCATION_WHERE, brandId },
          ...(actor.role === UserRole.ADMIN
            ? locationId
              ? { locationId }
              : {}
            : { locationId: { in: localIds } }),
        },
        orderBy: { id: 'asc' },
      }),
    ]);
    return [
      ...brands.map((row) => ({
        ...row,
        brandId,
        locationId: null as string | null,
      })),
      ...locations.map((row) => ({ ...row, brandId })),
    ].filter((row) =>
      hasPermission(
        actor,
        this.rolePermission(row.role),
        row.locationId ?? brandId,
        !!row.locationId,
      ),
    );
  }

  async membership(
    brandId: string,
    locationId: string | undefined,
    id: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const row = locationId
      ? await tx.locationMembership.findFirst({ where: { id, locationId } })
      : await tx.brandMembership.findFirst({ where: { id, brandId } });
    if (!row) throw new NotFoundException('Membership not found');
    return row;
  }

  async changeMembership(
    actor: TokenPayloadDto,
    brandId: string,
    locationId: string | undefined,
    id: string,
    role: BusinessRole | null,
    expectedVersion: number,
    tx: Prisma.TransactionClient,
  ) {
    this.assertVersion(
      (await this.policy(brandId, locationId, tx)).version,
      expectedVersion,
    );
    const row = await this.membership(brandId, locationId, id, tx);
    this.assertRole(actor, brandId, row.role, locationId);
    if (role) this.assertRole(actor, brandId, role, locationId);
    if (!locationId && role === BusinessRole.STAFF) this.invalidGrant();
    if (
      !locationId &&
      row.role === BusinessRole.OWNER &&
      role !== BusinessRole.OWNER &&
      (await tx.brandMembership.count({
        where: { brandId, role: BusinessRole.OWNER },
      })) <= 1
    ) {
      throw new AppException(ErrorCode.ACCESS_LAST_OWNER, HttpStatus.CONFLICT);
    }
    const result = locationId
      ? role
        ? await tx.locationMembership.update({ where: { id }, data: { role } })
        : await tx.locationMembership.delete({ where: { id } })
      : role
        ? await tx.brandMembership.update({ where: { id }, data: { role } })
        : await tx.brandMembership.delete({ where: { id } });
    await this.access.recordChange(
      brandId,
      actor.sub,
      role ? 'MEMBERSHIP_CHANGED' : 'MEMBERSHIP_REVOKED',
      id,
      { previousRole: row.role, role, userId: row.userId },
      tx,
      locationId,
    );
    return result;
  }

  async createInvitation(
    actor: TokenPayloadDto,
    brandId: string,
    grants: InvitationGrantDto[],
    tx: Prisma.TransactionClient,
  ) {
    const scopes = new Set<string>();
    for (const grant of grants) {
      const local = grant.scope === AccessScope.LOCATION;
      if (
        (local && !grant.locationId) ||
        (!local &&
          (grant.locationId ||
            grant.staffId ||
            grant.role === BusinessRole.STAFF)) ||
        (grant.role === BusinessRole.STAFF ? !grant.staffId : !!grant.staffId)
      )
        this.invalidGrant();
      const scopeId = local ? grant.locationId! : brandId;
      if (scopes.has(scopeId)) this.invalidGrant();
      scopes.add(scopeId);
      this.assertRole(actor, brandId, grant.role, grant.locationId);
    }
    const token = randomBytes(32).toString('hex');
    const invitation = await tx.accessInvitation.create({
      data: {
        brandId,
        issuerId: actor.sub,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
        grants: {
          create: grants.map((grant) => ({
            scopeId: grant.locationId ?? brandId,
            locationId: grant.locationId,
            role: grant.role,
            staffId: grant.staffId,
          })),
        },
      },
      include: { grants: true },
    });
    await this.access.recordChange(
      brandId,
      actor.sub,
      'INVITATION_CREATED',
      invitation.id,
      { grants },
      tx,
    );
    return { invitation, token };
  }

  invitationByToken(token: string, tx: Prisma.TransactionClient = this.db) {
    return tx.accessInvitation.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { grants: true },
    });
  }

  async invitation(
    brandId: string,
    id: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const row = await tx.accessInvitation.findFirst({
      where: { id, brandId },
      include: { grants: true },
    });
    if (!row) throw new NotFoundException('Invitation not found');
    return row;
  }

  async invitations(
    actor: TokenPayloadDto,
    brandId: string,
    locationId?: string,
  ) {
    const rows = await this.db.accessInvitation.findMany({
      where: {
        brandId,
        ...(locationId ? { grants: { some: { locationId } } } : {}),
      },
      include: { grants: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.filter((row) =>
      row.grants.every((grant) =>
        hasPermission(
          actor,
          this.rolePermission(grant.role),
          grant.locationId ?? brandId,
          !!grant.locationId,
        ),
      ),
    );
  }

  assertPending(invitation: {
    revokedAt: Date | null;
    acceptedAt: Date | null;
    expiresAt: Date;
  }) {
    if (
      invitation.revokedAt ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date()
    )
      throw new AppException(
        ErrorCode.ACCESS_INVITATION_INVALID,
        HttpStatus.GONE,
      );
  }

  async reissue(
    actor: TokenPayloadDto,
    brandId: string,
    id: string,
    tx: Prisma.TransactionClient,
  ) {
    const row = await this.invitation(brandId, id, tx);
    if (row.acceptedAt || row.revokedAt)
      throw new AppException(
        ErrorCode.ACCESS_INVITATION_INVALID,
        HttpStatus.CONFLICT,
      );
    for (const grant of row.grants)
      this.assertRole(
        actor,
        brandId,
        grant.role,
        grant.locationId ?? undefined,
      );
    const token = randomBytes(32).toString('hex');
    const invitation = await tx.accessInvitation.update({
      where: { id },
      data: {
        tokenHash: this.hash(token),
        issuerId: actor.sub,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        version: { increment: 1 },
      },
      include: { grants: true },
    });
    await this.access.recordChange(
      brandId,
      actor.sub,
      'INVITATION_REISSUED',
      id,
      {},
      tx,
    );
    return { invitation, token };
  }

  async revokeInvitation(
    actor: TokenPayloadDto,
    brandId: string,
    id: string,
    tx: Prisma.TransactionClient,
  ) {
    const row = await this.invitation(brandId, id, tx);
    for (const grant of row.grants)
      this.assertRole(
        actor,
        brandId,
        grant.role,
        grant.locationId ?? undefined,
      );
    if (row.acceptedAt)
      throw new AppException(
        ErrorCode.ACCESS_INVITATION_INVALID,
        HttpStatus.CONFLICT,
      );
    await tx.accessInvitation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    await this.access.recordChange(
      brandId,
      actor.sub,
      'INVITATION_REVOKED',
      id,
      {},
      tx,
    );
  }

  async grantMembership(
    brandId: string,
    userId: string,
    role: BusinessRole,
    locationId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    const rank = { OWNER: 3, MANAGER: 2, STAFF: 1 };
    if (locationId) {
      const key = { userId, locationId };
      const existing = await tx.locationMembership.findUnique({
        where: { userId_locationId: key },
      });
      return tx.locationMembership.upsert({
        where: { userId_locationId: key },
        create: { ...key, role },
        update: {
          role:
            existing && rank[existing.role] > rank[role] ? existing.role : role,
        },
      });
    }
    if (role === BusinessRole.STAFF) this.invalidGrant();
    const key = { userId, brandId };
    const existing = await tx.brandMembership.findUnique({
      where: { userId_brandId: key },
    });
    return tx.brandMembership.upsert({
      where: { userId_brandId: key },
      create: { ...key, role },
      update: {
        role:
          existing && rank[existing.role] > rank[role] ? existing.role : role,
      },
    });
  }

  async markAccepted(
    brandId: string,
    id: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    const row = await tx.accessInvitation.update({
      where: { id },
      data: { acceptedAt: new Date(), acceptedById: userId },
      include: { grants: true },
    });
    await this.access.recordChange(
      brandId,
      userId,
      'INVITATION_ACCEPTED',
      id,
      {},
      tx,
    );
    return row;
  }

  async replaceOwner(
    brandId: string,
    actorId: string,
    previousUserId: string,
    newUserId: string,
    reason: string,
    tx: Prisma.TransactionClient,
  ) {
    const previous = await tx.brandMembership.findUnique({
      where: { userId_brandId: { userId: previousUserId, brandId } },
    });
    if (
      !previous ||
      previous.role !== BusinessRole.OWNER ||
      previousUserId === newUserId
    )
      this.invalidGrant();
    await this.grantMembership(
      brandId,
      newUserId,
      BusinessRole.OWNER,
      null,
      tx,
    );
    await tx.brandMembership.delete({ where: { id: previous.id } });
    await this.access.recordChange(
      brandId,
      actorId,
      'OWNER_REPLACED',
      newUserId,
      { previousUserId, reason },
      tx,
    );
  }

  assertVersion(actual: number, expected: number) {
    if (actual !== expected)
      throw new AppException(
        ErrorCode.ACCESS_VERSION_CONFLICT,
        HttpStatus.CONFLICT,
      );
  }
  private invalidPolicy(): never {
    throw new AppException(
      ErrorCode.ACCESS_POLICY_INVALID,
      HttpStatus.BAD_REQUEST,
    );
  }
  private invalidGrant(): never {
    throw new AppException(
      ErrorCode.ACCESS_GRANT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}

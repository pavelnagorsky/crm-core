import { Injectable } from '@nestjs/common';
import { BusinessRole, Prisma, UserRole } from '@prisma/client';
import { PERMISSIONS_VERSION } from '../constants/permissions-version.js';
import { DatabaseService } from '../../../database/database.service.js';
import {
  ACTIVE_BRAND_WHERE,
  ACTIVE_LOCATION_WHERE,
} from '../../../shared/database/active-business.where.js';
import { PermissionCalculator } from '../calculators/permission.calculator.js';

@Injectable()
export class AccessService {
  constructor(
    private readonly db: DatabaseService,
    private readonly compute: PermissionCalculator,
  ) {}

  async resolvePermissions(
    userId: string,
    platformRole: UserRole,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const [brands, local] = await Promise.all([
      tx.brandMembership.findMany({
        where: {
          userId,
          role: { not: BusinessRole.STAFF },
          brand: ACTIVE_BRAND_WHERE,
        },
        select: {
          brandId: true,
          role: true,
          brand: {
            select: {
              locations: {
                where: ACTIVE_LOCATION_WHERE,
                select: { id: true, brandId: true },
              },
            },
          },
        },
      }),
      tx.locationMembership.findMany({
        where: { userId, location: ACTIVE_LOCATION_WHERE },
        select: {
          locationId: true,
          role: true,
          location: { select: { id: true, brandId: true } },
        },
      }),
    ]);
    const locations = [
      ...new Map(
        [
          ...brands.flatMap((row) => row.brand.locations),
          ...local.map((row) => row.location),
        ].map((row) => [row.id, row]),
      ).values(),
    ];
    const activeBrandIds = brands.map((row) => row.brandId);
    const brandIds = [
      ...new Set([...activeBrandIds, ...locations.map((row) => row.brandId)]),
    ];
    const locationIds = locations.map((row) => row.id);
    const [brandOverrides, locationOverrides] = await Promise.all([
      tx.brandPermissionOverride.findMany({
        where: { brandId: { in: brandIds } },
      }),
      tx.locationPermissionOverride.findMany({
        where: { locationId: { in: locationIds } },
      }),
    ]);
    const brandMemberships = brands.map(({ brandId, role }) => ({
      brandId,
      role,
    }));
    const locationMemberships = local.map((row) => ({
      locationId: row.locationId,
      brandId: row.location.brandId,
      role: row.role,
      inherited: false,
    }));
    const permissions = this.compute.claims(
      brandMemberships,
      locationMemberships,
      locations,
      brandOverrides,
      locationOverrides,
      platformRole,
    );
    return {
      brandMemberships,
      permissions,
      permissionsVersion: PERMISSIONS_VERSION,
      locationMemberships: [
        ...locationMemberships,
        ...locations.flatMap((location) =>
          brandMemberships
            .filter((row) => row.brandId === location.brandId)
            .map((row) => ({
              locationId: location.id,
              brandId: location.brandId,
              role: row.role,
              inherited: true,
            })),
        ),
      ],
    };
  }

  async lockBrand(
    brandId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.accessState.upsert({
      where: { brandId },
      create: { brandId },
      update: {},
    });
    await tx.$queryRaw`SELECT "brandId" FROM "AccessState" WHERE "brandId" = ${brandId} FOR UPDATE`;
  }

  async recordChange(
    brandId: string,
    actorId: string,
    action: string,
    targetId: string | null,
    payload: unknown,
    tx: Prisma.TransactionClient,
    locationId?: string,
  ) {
    await tx.accessState.update({
      where: { brandId },
      data: { revision: { increment: 1 } },
    });
    return tx.accessAudit.create({
      data: {
        brandId,
        actorId,
        action,
        targetId,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        locationId,
      },
    });
  }

  async assignInitialOwner(
    brandId: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    await this.lockBrand(brandId, tx);
    return tx.brandMembership.create({
      data: { brandId, userId, role: BusinessRole.OWNER },
    });
  }

  async revokeStaffAccess(
    brandId: string,
    locationId: string,
    staffId: string,
    userId: string | null,
    tx: Prisma.TransactionClient,
    actorId = 'system',
  ) {
    await this.lockBrand(brandId, tx);
    const revoked = userId
      ? await tx.locationMembership.deleteMany({
          where: { locationId, userId, role: BusinessRole.STAFF },
        })
      : { count: 0 };
    await tx.accessInvitation.updateMany({
      where: {
        brandId,
        acceptedAt: null,
        revokedAt: null,
        grants: { some: { staffId } },
      },
      data: { revokedAt: new Date() },
    });
    await this.recordChange(
      brandId,
      actorId,
      'STAFF_ACCESS_REVOKED',
      staffId,
      { userId },
      tx,
      locationId,
    );
    return revoked.count > 0;
  }

  async affectedUserIds(
    brandId: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const [brands, locations] = await Promise.all([
      tx.brandMembership.findMany({
        where: { brandId },
        select: { userId: true },
      }),
      tx.locationMembership.findMany({
        where: { location: { ...ACTIVE_LOCATION_WHERE, brandId } },
        select: { userId: true },
      }),
    ]);
    return [...new Set([...brands, ...locations].map((row) => row.userId))];
  }

  async memberUserIds(brandId: string) {
    const rows = await this.db.brandMembership.findMany({
      where: { brandId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}

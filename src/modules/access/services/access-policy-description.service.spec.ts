import { PermissionAccess } from '../enums/permission-access.enum.js';
import { BusinessRole } from '@prisma/client';
import { Claim } from '../enums/claim.enum.js';
import { Read, Write } from '../utils/permission.js';
import { PermissionCalculator } from '../calculators/permission.calculator.js';
import { PERMISSION_REGISTRY } from '../constants/permission-registry.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { AccessAdministrationService } from './access-administration.service.js';

describe('Editable access policy', () => {
  const db = {
    accessState: { findUnique: vi.fn().mockResolvedValue({ revision: 3 }) },
    brandPermissionOverride: { findMany: vi.fn().mockResolvedValue([]) },
    locationPermissionOverride: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const service = new AccessAdministrationService(
    db as never,
    {} as never,
    new PermissionCalculator(),
    {} as never,
  );

  it('exposes configurable role permissions without fixed or internal file controls', async () => {
    const policy = await service.describePolicy('brand-1');

    expect(policy.version).toBe(3);
    expect(policy.entries).toContainEqual(
      expect.objectContaining({
        role: BusinessRole.STAFF,
        ...Read(Claim.BOOKING),
      }),
    );
    expect(policy.entries.every((entry) => entry.configurable)).toBe(true);
    expect(
      policy.entries.some(
        (entry) =>
          entry.claim === Claim.FILE_BRAND &&
          entry.access === PermissionAccess.WRITE,
      ),
    ).toBe(false);
    expect(
      policy.entries.some(
        (entry) =>
          entry.claim === Claim.BOOKING_DELETE &&
          entry.access === PermissionAccess.WRITE,
      ),
    ).toBe(false);
    expect(
      policy.entries.some(
        (entry) =>
          entry.claim === Claim.CLIENT &&
          entry.access === PermissionAccess.READ,
      ),
    ).toBe(true);
  });

  it('limits location settings to configurable local permissions', async () => {
    const policy = await service.describePolicy('brand-1', 'location-1');

    expect(policy.entries.length).toBeGreaterThan(0);
    for (const entry of policy.entries) {
      expect([
        PermissionScope.LOCATION,
        PermissionScope.BRAND_OR_LOCATION,
      ]).toContain(PERMISSION_REGISTRY[entry.claim].scope);
      expect(entry.configurable).toBe(true);
    }
  });

  it('does not attach a newer access version to overrides fetched before a concurrent change', async () => {
    let revision = 3;
    db.accessState.findUnique.mockImplementationOnce(async () => {
      await Promise.resolve();
      return { revision };
    });
    db.brandPermissionOverride.findMany.mockImplementationOnce(async () => {
      revision = 4;
      return [];
    });

    const policy = await service.describePolicy('brand-1');

    expect(policy.version).toBe(3);
    expect(revision).toBe(4);
  });

  it.each([undefined, 'location-1'])(
    'describes staff reading as a prerequisite for invitations in scope %s',
    async (locationId) => {
      const policy = await service.describePolicy('brand-1', locationId);

      expect(policy.entries).toContainEqual(
        expect.objectContaining({
          role: BusinessRole.MANAGER,
          ...Write(Claim.ACCESS_STAFF),
          dependencies: [Read(Claim.STAFF)],
          allowed: true,
        }),
      );
      expect(
        policy.entries.some(
          (entry) =>
            entry.claim === Claim.STAFF &&
            entry.access === PermissionAccess.READ,
        ),
      ).toBe(false);
    },
  );
});

import { BusinessRole } from '@prisma/client';
import { PermissionCalculator } from '../calculators/permission.calculator.js';
import { PERMISSION_REGISTRY } from '../constants/permission-registry.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { Permission } from '../enums/permission.enum.js';
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
  );

  it('exposes configurable role permissions without fixed or internal file controls', async () => {
    const policy = await service.describePolicy('brand-1');

    expect(policy.version).toBe(3);
    expect(policy.entries).toContainEqual(
      expect.objectContaining({
        role: BusinessRole.STAFF,
        permission: Permission.BOOKING_READ,
      }),
    );
    expect(policy.entries.every((entry) => entry.configurable)).toBe(true);
    expect(
      policy.entries.some(
        (entry) => entry.permission === Permission.FILE_BRAND_MANAGE,
      ),
    ).toBe(false);
    expect(
      policy.entries.some(
        (entry) => entry.permission === Permission.BOOKING_DELETE,
      ),
    ).toBe(false);
    expect(
      policy.entries.some(
        (entry) => entry.permission === Permission.CLIENT_READ,
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
      ]).toContain(PERMISSION_REGISTRY[entry.permission].scope);
      expect(entry.configurable).toBe(true);
    }
  });
});

import { BusinessRole } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { PermissionCalculator } from '../calculators/permission.calculator.js';
import { includesAccess, Read, Write } from '../utils/permission.js';
import {
  PERMISSION_REGISTRY,
  REGISTERED_PERMISSIONS,
  isRegisteredPermission,
} from './permission-registry.js';
import { ROLE_BAGS } from './role-bags.js';

describe('Permission catalog consistency', () => {
  it('defines every claim once, with only supported actions and registered dependencies', () => {
    expect(Object.keys(PERMISSION_REGISTRY).sort()).toEqual(
      Object.values(Claim).sort(),
    );
    for (const definition of Object.values(PERMISSION_REGISTRY)) {
      expect(Object.keys(definition.actions).length).toBeGreaterThan(0);
      for (const [access, action] of Object.entries(definition.actions)) {
        expect([PermissionAccess.READ, PermissionAccess.WRITE]).toContain(
          access,
        );
        expect(action.configurable).not.toContain(BusinessRole.OWNER);
        for (const dependency of action.dependencies)
          expect(isRegisteredPermission(dependency)).toBe(true);
      }
    }
  });

  it('keeps defaults explicit, unique per claim, and valid after dependency resolution', () => {
    const calculator = new PermissionCalculator();
    for (const role of Object.values(BusinessRole)) {
      const bag = ROLE_BAGS[role];
      expect(new Set(bag.map((permission) => permission.claim)).size).toBe(
        bag.length,
      );
      const effective = calculator.rolePermissions(role, []);
      expect(effective).toEqual(
        Object.fromEntries(bag.map(({ claim, access }) => [claim, access])),
      );
      for (const permission of bag)
        expect(isRegisteredPermission(permission)).toBe(true);
    }
  });

  it('rejects every unknown claim and every unsupported action', () => {
    for (const claim of ['unknown', '*', 'toString', '__proto__']) {
      expect(isRegisteredPermission(Read(claim as Claim))).toBe(false);
      expect(isRegisteredPermission(Write(claim as Claim))).toBe(false);
    }
    for (const permission of REGISTERED_PERMISSIONS) {
      expect(isRegisteredPermission(permission)).toBe(true);
      expect(
        includesAccess(PermissionAccess.READ_WRITE, permission.access),
      ).toBe(true);
    }
  });

  it('keeps the frontend catalog aligned with backend scopes, actions, dependencies, and defaults', () => {
    const catalog = JSON.parse(
      readFileSync(
        new URL('../../../../docs/frontend-permissions.json', import.meta.url),
        'utf8',
      ),
    );
    expect(catalog.schemaVersion).toBe(2);
    expect(Object.keys(catalog.claims).sort()).toEqual(
      Object.values(Claim).sort(),
    );
    for (const claim of Object.values(Claim)) {
      const definition = PERMISSION_REGISTRY[claim];
      const metadata = catalog.claims[claim];
      expect(metadata.scope).toBe(definition.scope);
      expect(Object.keys(metadata.actions).sort()).toEqual(
        Object.keys(definition.actions).sort(),
      );
      for (const [access, action] of Object.entries(definition.actions)) {
        expect(metadata.actions[access].configurableRoles).toEqual(
          action.configurable,
        );
        expect(metadata.actions[access].dependencies).toEqual(
          action.dependencies,
        );
        expect(metadata.actions[access].defaultRoles).toEqual(
          Object.values(BusinessRole).filter((role) =>
            ROLE_BAGS[role].some(
              (permission) =>
                permission.claim === claim &&
                includesAccess(permission.access, access as PermissionAccess),
            ),
          ),
        );
      }
    }
  });
});

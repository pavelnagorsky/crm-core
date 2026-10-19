import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { PermissionGrants } from '../interfaces/permission-grants.interface.js';
import { Read, ReadWrite, Write, addGrant, removeGrant } from './permission.js';

describe('Grant updates', () => {
  it.each([
    [PermissionAccess.READ, Write(Claim.ORDER)],
    [PermissionAccess.WRITE, Read(Claim.ORDER)],
  ])(
    'preserves %s when removing an action that is not granted',
    (access, removal) => {
      const grants: PermissionGrants = { [Claim.ORDER]: access };
      removeGrant(grants, removal);
      expect(grants).toEqual({ [Claim.ORDER]: access });
    },
  );

  it.each([
    [Read(Claim.ORDER), PermissionAccess.WRITE],
    [Write(Claim.ORDER), PermissionAccess.READ],
  ])(
    'removes only the requested action from readWrite',
    (removal, remaining) => {
      const grants: PermissionGrants = {
        [Claim.ORDER]: PermissionAccess.READ_WRITE,
      };
      removeGrant(grants, removal);
      expect(grants).toEqual({ [Claim.ORDER]: remaining });
      removeGrant(grants, removal);
      expect(grants).toEqual({ [Claim.ORDER]: remaining });
    },
  );

  it.each(Object.values(PermissionAccess))(
    'removes both requested actions from %s without touching other claims',
    (access) => {
      const grants: PermissionGrants = {
        [Claim.ORDER]: access,
        [Claim.CLIENT]: PermissionAccess.READ,
      };
      removeGrant(grants, ReadWrite(Claim.ORDER));
      expect(grants).toEqual({ [Claim.CLIENT]: PermissionAccess.READ });
    },
  );

  it('combines independent grants without overwriting either action', () => {
    const grants: PermissionGrants = {};
    addGrant(grants, Read(Claim.ORDER));
    addGrant(grants, Write(Claim.ORDER));
    addGrant(grants, Read(Claim.ORDER));
    expect(grants).toEqual({ [Claim.ORDER]: PermissionAccess.READ_WRITE });
  });
});

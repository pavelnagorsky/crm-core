import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { hasPermission } from './assert-permission.js';
import { Read, ReadWrite, Write } from './permission.js';

describe('Claim access checks', () => {
  it.each([
    [PermissionAccess.READ, true, false, false],
    [PermissionAccess.WRITE, false, true, false],
    [PermissionAccess.READ_WRITE, true, true, true],
  ])(
    'checks %s as explicit actions, not an ordered access level',
    (access, read, write, both) => {
      const token = tokenPayload();
      token.permissions = { 'L:location-1': { [Claim.ORDER]: access } };
      expect(hasPermission(token, Read(Claim.ORDER), 'location-1')).toBe(read);
      expect(hasPermission(token, Write(Claim.ORDER), 'location-1')).toBe(
        write,
      );
      expect(hasPermission(token, ReadWrite(Claim.ORDER), 'location-1')).toBe(
        both,
      );
    },
  );

  it('does not grant children, own access, or other scopes through a parent claim', () => {
    const token = tokenPayload();
    token.permissions = {
      'L:location-1': { [Claim.BOOKING]: PermissionAccess.READ_WRITE },
    };
    for (const permission of [
      Read(Claim.BOOKING_OWN),
      Write(Claim.BOOKING_DELETE),
      Read(Claim.BOOKING_EXPORT),
      Write(Claim.BOOKING_CLIENT_TOKEN),
    ]) {
      expect(hasPermission(token, permission, 'location-1')).toBe(false);
    }
    expect(hasPermission(token, Read(Claim.BOOKING), 'location-2')).toBe(false);
    expect(hasPermission(token, Read(Claim.BOOKING), '')).toBe(false);
  });

  it('rejects unsupported actions before checking even a global grant', () => {
    const token = tokenPayload();
    token.permissions = { '*': ['*'] };
    expect(hasPermission(token, Read(Claim.ORDER_RETURN), 'location-1')).toBe(
      false,
    );
    expect(
      hasPermission(token, ReadWrite(Claim.ORDER_RETURN), 'location-1'),
    ).toBe(false);
    expect(
      hasPermission(token, Write(Claim.BOOKING_EXPORT), 'location-1'),
    ).toBe(false);
    expect(hasPermission(token, Write(Claim.ORDER_RETURN), 'location-1')).toBe(
      true,
    );
    expect(
      hasPermission(
        token,
        { claim: Claim.ORDER, access: 'invalid' as PermissionAccess },
        'location-1',
      ),
    ).toBe(false);
  });

  it('fails closed for old scoped arrays and invalid access values', () => {
    const token = tokenPayload();
    for (const grants of [
      ['order.read'],
      { order: '*' },
      { order: 'invalid' },
    ]) {
      token.permissions = { 'L:location-1': grants } as never;
      expect(hasPermission(token, Read(Claim.ORDER), 'location-1')).toBe(false);
    }
  });

  it.each(['*', 'prefix*suffix', ['*', 'order'], [], {}, null, 1])(
    'rejects a malformed global grant %j without throwing',
    (global) => {
      const token = tokenPayload();
      token.permissions = { '*': global } as never;
      expect(hasPermission(token, Read(Claim.ORDER), 'location-1')).toBe(false);
    },
  );
});

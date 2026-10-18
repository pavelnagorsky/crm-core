import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Permission } from '../../access/enums/permission.enum.js';
import { tokenPayload } from '../testing/factories/token-payload.factory.js';
import { PermissionGuard } from './permission.guard.js';

describe('Permission alternatives', () => {
  const reflector = { getAllAndOverride: vi.fn() };
  const guard = new PermissionGuard(reflector as never);
  const context = (params = { locationId: 'location-1' }) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: tokenPayload('STAFF'), params }),
      }),
    }) as unknown as ExecutionContext;

  it('accepts own or full reading', () => {
    reflector.getAllAndOverride.mockReturnValue([
      [Permission.BOOKING_READ, Permission.BOOKING_READ_OWN],
    ]);
    expect(guard.canActivate(context())).toBe(true);
  });

  it('still requires every argument outside the alternative group', () => {
    reflector.getAllAndOverride.mockReturnValue([
      [Permission.BOOKING_READ, Permission.BOOKING_READ_OWN],
      Permission.ORDER_MANAGE,
    ]);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it.each([
    { requirements: [] },
    { requirements: [[]] },
    { requirements: [['unknown']] },
    { requirements: [Permission.BOOKING_READ] },
  ])('fails closed for requirements $requirements', ({ requirements }) => {
    reflector.getAllAndOverride.mockReturnValue(requirements);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it('requires permissions in the requested location', () => {
    reflector.getAllAndOverride.mockReturnValue([
      [Permission.BOOKING_READ, Permission.BOOKING_READ_OWN],
    ]);
    expect(() => guard.canActivate(context({ locationId: 'other' }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context({ locationId: '' }))).toThrow(
      ForbiddenException,
    );
  });
});

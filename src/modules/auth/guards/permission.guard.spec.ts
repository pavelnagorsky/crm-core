import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { tokenPayload } from '../testing/factories/token-payload.factory.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';
import { PermissionGuard } from './permission.guard.js';

describe('Permission alternatives', () => {
  const reflector = { getAllAndOverride: vi.fn() };
  const guard = new PermissionGuard(reflector as never);
  const context = (
    params = { locationId: 'location-1' },
    user: TokenPayloadDto = tokenPayload('STAFF'),
  ) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user, params }),
      }),
    }) as unknown as ExecutionContext;

  it('accepts own or full reading', () => {
    reflector.getAllAndOverride.mockReturnValue([
      [Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)],
    ]);
    expect(guard.canActivate(context())).toBe(true);
  });

  it('still requires every argument outside the alternative group', () => {
    reflector.getAllAndOverride.mockReturnValue([
      [Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)],
      Write(Claim.ORDER),
    ]);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it.each([
    { requirements: [] },
    { requirements: [[]] },
    { requirements: [['unknown']] },
    { requirements: [Read(Claim.BOOKING)] },
  ])('fails closed for requirements $requirements', ({ requirements }) => {
    reflector.getAllAndOverride.mockReturnValue(requirements);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it('requires permissions in the requested location', () => {
    reflector.getAllAndOverride.mockReturnValue([
      [Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)],
    ]);
    expect(() => guard.canActivate(context({ locationId: 'other' }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context({ locationId: '' }))).toThrow(
      ForbiddenException,
    );
  });

  it('accepts global claims for a location without membership', () => {
    const token = {
      ...tokenPayload('STAFF'),
      permissions: { '*': ['*'] },
    } as TokenPayloadDto;
    reflector.getAllAndOverride.mockReturnValue([Write(Claim.ORDER)]);
    expect(
      guard.canActivate(context({ locationId: 'unrelated-location' }, token)),
    ).toBe(true);
  });

  it('still requires scope identifiers and registered permission metadata with global access', () => {
    const token = {
      ...tokenPayload(),
      permissions: { '*': ['*'] },
    } as TokenPayloadDto;
    reflector.getAllAndOverride.mockReturnValue([Write(Claim.ORDER)]);
    expect(() => guard.canActivate(context({ locationId: '' }, token))).toThrow(
      ForbiddenException,
    );
    for (const requirements of [[], ['unknown'], ['*']]) {
      reflector.getAllAndOverride.mockReturnValue(requirements);
      expect(() =>
        guard.canActivate(context({ locationId: 'location-1' }, token)),
      ).toThrow(ForbiddenException);
    }
  });
});

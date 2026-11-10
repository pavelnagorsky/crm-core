import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';
import { TokenEpochGuard } from './token-epoch.guard.js';

function context(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as ExecutionContext;
}

describe('OptionalJwtAuthGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const tokenEpochGuard = {
      canActivate: vi.fn().mockResolvedValue(true),
    };
    return {
      tokenEpochGuard,
      guard: new OptionalJwtAuthGuard(
        tokenEpochGuard as unknown as TokenEpochGuard,
      ),
    };
  }

  it('lets guests through without validating anything', async () => {
    const jwt = vi.spyOn(JwtAuthGuard.prototype, 'canActivate');
    const { guard, tokenEpochGuard } = setup();
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(jwt).not.toHaveBeenCalled();
    expect(tokenEpochGuard.canActivate).not.toHaveBeenCalled();
  });

  it('rejects a present but invalid token instead of downgrading to guest', async () => {
    vi.spyOn(JwtAuthGuard.prototype, 'canActivate').mockRejectedValue(
      new UnauthorizedException(),
    );
    const { guard, tokenEpochGuard } = setup();
    await expect(guard.canActivate(context('Bearer bad'))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokenEpochGuard.canActivate).not.toHaveBeenCalled();
  });

  it('checks the token epoch after a valid token', async () => {
    vi.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);
    const { guard, tokenEpochGuard } = setup();
    await expect(guard.canActivate(context('Bearer ok'))).resolves.toBe(true);
    expect(tokenEpochGuard.canActivate).toHaveBeenCalled();
  });
});

import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';
import { TokenEpochRegistryService } from '../services/token-epoch-registry.service.js';
import { TokenEpochGuard } from './token-epoch.guard.js';

function context(
  user: TokenPayloadDto,
  params: Record<string, string>,
): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  } as unknown as ExecutionContext;
}

function payload(overrides: Partial<TokenPayloadDto> = {}): TokenPayloadDto {
  return {
    sub: 'user-1',
    role: UserRole.USER,
    firstName: 'Ada',
    lastName: 'Lovelace',
    brandMemberships: [],
    locationMemberships: [],
    tokenEpoch: 100,
    ...overrides,
  };
}

describe('TokenEpochGuard', () => {
  it.each([0, 1000])(
    'rejects an epoch of %s when the persisted epoch differs',
    async (tokenEpoch) => {
      const registry = {
        get: vi.fn().mockResolvedValue(200),
      } as unknown as TokenEpochRegistryService;
      const guard = new TokenEpochGuard(registry);

      await expect(
        guard.canActivate(context(payload({ tokenEpoch }), {})),
      ).rejects.toMatchObject({
        errorCode: 'TOKEN_PAYLOAD_STALE',
      });
    },
  );
});

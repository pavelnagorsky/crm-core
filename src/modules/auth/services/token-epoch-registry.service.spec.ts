import { UserService } from '../../user/services/user.service.js';
import { TokenEpochRegistryService } from './token-epoch-registry.service.js';

describe('Token epoch invalidation', () => {
  it('retains revocations when recreated and increments across concurrent registry instances', async () => {
    let tokenEpoch = 0;
    const store = {
      user: {
        findUnique: vi.fn(async () => ({ tokenEpoch })),
        update: vi.fn(async () => ({ tokenEpoch: ++tokenEpoch })),
      },
    };
    const users = new UserService(store as never);
    const first = new TokenEpochRegistryService(users);
    const other = new TokenEpochRegistryService(users);
    await first.bump('user');
    const issuedVersion = await first.get('user');
    await Promise.all([first.bump('user'), other.bump('user')]);
    expect(await new TokenEpochRegistryService(users).get('user')).toBe(
      issuedVersion + 2,
    );
    expect(store.user.update).toHaveBeenCalledWith({
      where: { id: 'user' },
      data: { tokenEpoch: { increment: 1 } },
      select: { tokenEpoch: true },
    });
  });

  it('rejects tokens for a deleted user', async () => {
    const users = new UserService({
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);
    await expect(
      new TokenEpochRegistryService(users).get('missing'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('uses the caller transaction for revocation', async () => {
    const tx = {
      user: { update: vi.fn().mockResolvedValue({ tokenEpoch: 3 }) },
    };
    const users = new UserService({} as never);
    expect(
      await new TokenEpochRegistryService(users).bump('user', tx as never),
    ).toBe(3);
    expect(tx.user.update).toHaveBeenCalledOnce();
  });
});

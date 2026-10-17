import { hash } from 'bcrypt';
import { PASSWORD_HASH_ROUNDS } from '../constants/auth.constants.js';
import { PasswordResetService } from './password-reset.service.js';

describe('PasswordResetService', () => {
  let codeHash: string;
  beforeAll(async () => {
    codeHash = await hash('123456', PASSWORD_HASH_ROUNDS);
  });

  function setup() {
    const record = {
      id: 'reset',
      userId: 'user',
      codeHash,
      failedAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 120_000),
    };
    const tx = {
      passwordResetCode: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      refreshToken: { deleteMany: vi.fn() },
    };
    const db = {
      passwordResetCode: {
        findUnique: vi.fn().mockResolvedValue(record),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (run: (value: typeof tx) => unknown) =>
        run(tx),
      ),
    };
    const users = {
      findByEmail: vi
        .fn()
        .mockResolvedValue({ id: 'user', email: 'user@example.com' }),
      update: vi.fn(),
    };
    const epochs = { bump: vi.fn() };
    const events = { emit: vi.fn() };
    const service = new PasswordResetService(
      db as never,
      users as never,
      events as never,
      epochs as never,
    );
    return { record, tx, db, users, epochs, events, service };
  }
  const request = {
    email: 'user@example.com',
    code: '123456',
    password: 'NewPassword123',
  };

  it('consumes the code, changes the password and revokes refresh tokens in the same transaction', async () => {
    const { service, tx, users, epochs } = setup();
    await service.reset(request);
    expect(tx.passwordResetCode.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'reset',
        codeHash,
        failedAttempts: { lt: 5 },
        expiresAt: { gt: expect.any(Date) },
      }),
    });
    expect(users.update).toHaveBeenCalledWith(
      'user',
      { passwordHash: expect.any(String) },
      tx,
    );
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user' },
    });
    expect(epochs.bump).toHaveBeenCalledWith('user', tx);
  });
  it('rejects a code consumed or replaced while the password was being hashed', async () => {
    const { service, tx, users, epochs } = setup();
    tx.passwordResetCode.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.reset(request)).rejects.toMatchObject({
      errorCode: 'INVALID_RESET_CODE',
    });
    expect(users.update).not.toHaveBeenCalled();
    expect(epochs.bump).not.toHaveBeenCalled();
  });
  it('records a failed guess without changing credentials', async () => {
    const { service, db, users } = setup();
    await expect(
      service.reset({ ...request, code: '000000' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_RESET_CODE' });
    expect(db.passwordResetCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'reset', codeHash, failedAttempts: { lt: 5 } },
      data: { failedAttempts: { increment: 1 } },
    });
    expect(users.update).not.toHaveBeenCalled();
  });
  it('rejects even a correct code after the attempt limit', async () => {
    const { service, record, db } = setup();
    record.failedAttempts = 5;
    await expect(service.reset(request)).rejects.toMatchObject({
      errorCode: 'INVALID_RESET_CODE',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('does not invalidate access tokens if the password transaction fails', async () => {
    const { service, users, epochs } = setup();
    users.update.mockRejectedValue(new Error('storage unavailable'));
    await expect(service.reset(request)).rejects.toThrow('storage unavailable');
    expect(epochs.bump).not.toHaveBeenCalled();
  });
  it('does not email a code if a concurrent request already refreshed it', async () => {
    const { service, db, events } = setup();
    db.passwordResetCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.request({ email: request.email }),
    ).rejects.toMatchObject({ errorCode: 'RESET_CODE_RESEND_TOO_SOON' });
    expect(events.emit).not.toHaveBeenCalled();
  });
});

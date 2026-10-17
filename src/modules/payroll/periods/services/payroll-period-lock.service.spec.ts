import { PayrollPeriod, PayrollPeriodStatus } from '@prisma/client';
import { PayrollPeriodLockService } from './payroll-period-lock.service.js';

describe('PayrollPeriodLockService', () => {
  const expected = {
    id: 'period',
    status: PayrollPeriodStatus.CALCULATED,
    updatedAt: new Date('2026-10-17T10:00:00Z'),
  } as PayrollPeriod;
  const locks = new PayrollPeriodLockService();

  it('accepts an unchanged locked period', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([expected]) };
    await expect(
      locks.lockUnchangedPeriod(expected, tx as never),
    ).resolves.toBeUndefined();
  });

  it('rejects a period deleted before its lock is acquired', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await expect(
      locks.lockUnchangedPeriod(expected, tx as never),
    ).rejects.toMatchObject({ errorCode: 'PAYROLL_PERIOD_NOT_FOUND' });
  });

  it.each([
    { ...expected, status: PayrollPeriodStatus.APPROVED },
    { ...expected, updatedAt: new Date(expected.updatedAt.getTime() + 1) },
  ])('rejects a concurrent period change', async (current) => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([current]) };
    await expect(
      locks.lockUnchangedPeriod(expected, tx as never),
    ).rejects.toMatchObject({
      errorCode: 'PAYROLL_PERIOD_CONCURRENT_UPDATE',
      status: 409,
    });
  });
});

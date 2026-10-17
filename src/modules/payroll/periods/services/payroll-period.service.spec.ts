import { PayrollPeriodStatus } from '@prisma/client';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { PayrollPeriodService } from './payroll-period.service.js';

describe('PayrollPeriodService write coordination', () => {
  const actor = { name: 'Owner', role: AuditActorRole.OWNER, id: 'owner' };
  function setup() {
    const period = {
      id: 'period',
      locationId: 'location',
      status: PayrollPeriodStatus.CALCULATED,
      results: [],
    };
    const tx = {
      payrollPeriod: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    };
    const db = {
      payrollPeriod: { findUnique: vi.fn().mockResolvedValue(period) },
      $transaction: vi.fn(
        async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
      ),
    };
    const locks = { lockLocation: vi.fn(), lockUnchangedPeriod: vi.fn() };
    const events = { emit: vi.fn() };
    const service = new PayrollPeriodService(
      db as never,
      {} as never,
      { getLocale: vi.fn().mockResolvedValue({ currency: 'BYN' }) } as never,
      events as never,
      {} as never,
      locks as never,
    );
    return { service, tx, locks, events, period };
  }

  it('checks overlapping dates after acquiring the location lock', async () => {
    const { service, tx, locks } = setup();
    tx.payrollPeriod.findFirst.mockResolvedValue({ id: 'other' });
    await expect(
      service.create(
        'location',
        { startDate: '2026-10-01', endDate: '2026-10-31' },
        actor,
      ),
    ).rejects.toMatchObject({ errorCode: 'PAYROLL_PERIOD_OVERLAP' });
    expect(locks.lockLocation).toHaveBeenCalledWith('location', tx);
    expect(locks.lockLocation.mock.invocationCallOrder[0]).toBeLessThan(
      tx.payrollPeriod.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.payrollPeriod.create).not.toHaveBeenCalled();
  });

  it.each(['approve', 'delete'] as const)(
    'rejects stale %s without writing or emitting audit',
    async (operation) => {
      const { service, tx, locks, events } = setup();
      locks.lockUnchangedPeriod.mockRejectedValue(
        new Error('concurrent change'),
      );
      await expect(service[operation]('period', actor)).rejects.toThrow(
        'concurrent change',
      );
      expect(tx.payrollPeriod.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    },
  );
});

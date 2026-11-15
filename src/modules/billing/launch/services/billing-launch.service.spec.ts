import { BadRequestException } from '@nestjs/common';
import { BillingActorRole } from '@prisma/client';
import { SubscriptionBackfillRow } from '../../interfaces/subscription-backfill-row.interface.js';
import { BillingLaunchService } from './billing-launch.service.js';

describe('BillingLaunchService', () => {
  const now = new Date('2026-11-15T09:00:00Z');
  const launchedAt = new Date('2026-11-10T09:00:00Z');

  const settings = { markLaunched: vi.fn() };
  const subscriptions = {
    findExistingBrandIds: vi.fn(),
    findTrialUserIds: vi.fn(),
    invalidateMany: vi.fn(),
  };
  const starts = { backfill: vi.fn() };
  const brands = { findAllForBillingLaunch: vi.fn() };
  const access = { findOwnerIdsByBrands: vi.fn() };
  const locations = { findBillingOrigins: vi.fn() };
  const service = new BillingLaunchService(
    settings as never,
    subscriptions as never,
    starts as never,
    brands as never,
    access as never,
    locations as never,
  );

  /** Brands with a subscription in the "database"; backfill adds to it. */
  let stored: Set<string>;
  /** Users whose trial is already spent in the "database". */
  let spentUsers: Set<string>;
  let owners: Map<string, string[]>;

  const brandRows = (...ids: string[]) =>
    ids.map((id, i) => ({ id, createdAt: new Date(Date.UTC(2025, 0, i + 1)) }));

  const backfilledRows = (): SubscriptionBackfillRow[] =>
    starts.backfill.mock.calls.flatMap(
      (call) => call[0] as SubscriptionBackfillRow[],
    );

  beforeEach(() => {
    vi.clearAllMocks();
    stored = new Set();
    spentUsers = new Set();
    owners = new Map();
    settings.markLaunched.mockResolvedValue({
      defaultCountryCode: 'BY',
      launchedAt,
    });
    subscriptions.findExistingBrandIds.mockImplementation(
      async (ids: string[]) => new Set(ids.filter((id) => stored.has(id))),
    );
    subscriptions.findTrialUserIds.mockImplementation(
      async (ids: string[]) => new Set(ids.filter((id) => spentUsers.has(id))),
    );
    starts.backfill.mockImplementation(
      async (rows: SubscriptionBackfillRow[]) => {
        for (const row of rows) {
          stored.add(row.brandId);
          if (row.trialUserId) spentUsers.add(row.trialUserId);
        }
        return rows.length;
      },
    );
    access.findOwnerIdsByBrands.mockImplementation(
      async (ids: string[]) =>
        new Map(
          ids.filter((id) => owners.has(id)).map((id) => [id, owners.get(id)!]),
        ),
    );
    locations.findBillingOrigins.mockResolvedValue(new Map());
  });

  it('rejects a trial end that is not in the future and does not mark the launch', async () => {
    await expect(
      service.launch('2026-11-15', 'admin-1', now),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.launch('2026-11-01', 'admin-1', now),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(settings.markLaunched).not.toHaveBeenCalled();
    expect(starts.backfill).not.toHaveBeenCalled();
  });

  it('gives every brand without a subscription a trial, deleted ones included', async () => {
    brands.findAllForBillingLaunch.mockResolvedValue(
      brandRows('b1', 'b2', 'b3'),
    );
    stored.add('b2');
    owners.set('b1', ['u1']).set('b3', ['u3']);
    locations.findBillingOrigins.mockResolvedValue(
      new Map([['b1', { countryCode: 'KZ', timezone: 'Asia/Almaty' }]]),
    );

    const result = await service.launch('2027-01-01', 'admin-1', now);

    expect(settings.markLaunched).toHaveBeenCalledWith(now, 'admin-1');
    expect(result).toEqual({ launchedAt, created: 2, remaining: 0 });
    expect(backfilledRows()).toEqual([
      {
        brandId: 'b1',
        trialUserId: 'u1',
        countryCode: 'KZ',
        timezone: 'Asia/Almaty',
      },
      {
        brandId: 'b3',
        trialUserId: 'u3',
        countryCode: 'BY',
        timezone: 'Europe/Minsk',
      },
    ]);
    expect(starts.backfill).toHaveBeenCalledWith(
      expect.any(Array),
      '2027-01-01',
      { id: 'admin-1', role: BillingActorRole.ADMIN },
      now,
    );
    expect(subscriptions.invalidateMany).toHaveBeenCalledWith(['b1', 'b3']);
  });

  it('runs as the system without an admin id', async () => {
    brands.findAllForBillingLaunch.mockResolvedValue(brandRows('b1'));
    await service.launch('2027-01-01', null, now);
    expect(starts.backfill.mock.calls[0][2]).toEqual({
      id: null,
      role: BillingActorRole.SYSTEM,
    });
  });

  it('gives trialUserId only to the oldest brand of an owner', async () => {
    brands.findAllForBillingLaunch.mockResolvedValue(
      brandRows('old', 'mid', 'new'),
    );
    owners.set('old', ['u1']).set('mid', ['u1', 'u2']).set('new', ['u1', 'u2']);

    await service.launch('2027-01-01', 'admin-1', now);

    expect(backfilledRows().map((r) => [r.brandId, r.trialUserId])).toEqual([
      ['old', 'u1'],
      ['mid', 'u2'],
      ['new', null],
    ]);
  });

  it('does not give a trial to an owner who spent it before the launch', async () => {
    brands.findAllForBillingLaunch.mockResolvedValue(brandRows('b1'));
    owners.set('b1', ['pilot-owner']);
    spentUsers.add('pilot-owner');

    await service.launch('2027-01-01', 'admin-1', now);

    expect(backfilledRows()).toEqual([
      expect.objectContaining({ brandId: 'b1', trialUserId: null }),
    ]);
  });

  it('a repeated run creates nothing and keeps the first launch date', async () => {
    brands.findAllForBillingLaunch.mockResolvedValue(brandRows('b1', 'b2'));
    owners.set('b1', ['u1']).set('b2', ['u1']);

    const first = await service.launch('2027-01-01', 'admin-1', now);
    const second = await service.launch(
      '2027-01-01',
      'admin-1',
      new Date('2026-11-16T09:00:00Z'),
    );

    expect(first).toEqual({ launchedAt, created: 2, remaining: 0 });
    expect(second).toEqual({ launchedAt, created: 0, remaining: 0 });
    expect(starts.backfill).toHaveBeenCalledTimes(1);
    expect(backfilledRows().filter((r) => r.trialUserId === 'u1')).toHaveLength(
      1,
    );
  });

  it('reports brands that are still without a subscription', async () => {
    brands.findAllForBillingLaunch.mockResolvedValue(brandRows('b1', 'b2'));
    starts.backfill.mockImplementation(
      async (rows: SubscriptionBackfillRow[]) => {
        stored.add(rows[0].brandId);
        return 1;
      },
    );

    const result = await service.launch('2027-01-01', 'admin-1', now);

    expect(result).toEqual({ launchedAt, created: 1, remaining: 1 });
  });

  it('works in batches of 500 and an owner taken in one batch stays taken in the next', async () => {
    const ids = Array.from(
      { length: 501 },
      (_, i) => `b${String(i).padStart(3, '0')}`,
    );
    brands.findAllForBillingLaunch.mockResolvedValue(brandRows(...ids));
    owners.set(ids[0], ['u1']).set(ids[500], ['u1']);

    const result = await service.launch('2027-01-01', 'admin-1', now);

    expect(starts.backfill).toHaveBeenCalledTimes(2);
    expect(starts.backfill.mock.calls[0][0]).toHaveLength(500);
    expect(starts.backfill.mock.calls[1][0]).toHaveLength(1);
    expect(starts.backfill.mock.calls[1][0][0]).toMatchObject({
      brandId: ids[500],
      trialUserId: null,
    });
    expect(result).toEqual({ launchedAt, created: 501, remaining: 0 });
  });
});

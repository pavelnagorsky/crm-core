import { BookingStaffLoadService } from './booking-staff-load.service.js';

function setup(
  groups: { staffId: string; startAt: Date; count: number }[] = [],
  lastAssigned: { staffId: string; lastAssignedAt: Date }[] = [],
) {
  const db = {
    bookingItem: {
      groupBy: vi.fn(async () =>
        groups.map((group) => ({
          staffId: group.staffId,
          startAt: group.startAt,
          _count: { id: group.count },
        })),
      ),
    },
    $queryRaw: vi.fn(async () => lastAssigned),
  };
  return { service: new BookingStaffLoadService(db as never), db };
}

describe('BookingStaffLoadService.dayLoads', () => {
  it('counts booking items per staff member and local day with one groupBy', async () => {
    const { service, db } = setup([
      { staffId: 'anna', startAt: new Date('2026-11-10T09:00:00Z'), count: 2 },
      { staffId: 'anna', startAt: new Date('2026-11-10T12:00:00Z'), count: 1 },
      { staffId: 'anna', startAt: new Date('2026-11-11T09:00:00Z'), count: 1 },
      { staffId: 'boris', startAt: new Date('2026-11-10T09:00:00Z'), count: 4 },
    ]);

    const loads = await service.dayLoads(
      'location-1',
      ['anna', 'boris'],
      '2026-11-10',
      '2026-11-11',
      'UTC',
    );

    expect(db.bookingItem.groupBy).toHaveBeenCalledTimes(1);
    expect(loads.get('anna')?.get('2026-11-10')).toBe(3);
    expect(loads.get('anna')?.get('2026-11-11')).toBe(1);
    expect(loads.get('boris')?.get('2026-11-10')).toBe(4);
    expect(loads.get('boris')?.get('2026-11-11')).toBeUndefined();
  });

  it('assigns an item to the day of the location, not of UTC', async () => {
    // 22:30 UTC on the 10th is 01:30 on the 11th in Minsk (UTC+3).
    const { service } = setup([
      { staffId: 'anna', startAt: new Date('2026-11-10T22:30:00Z'), count: 1 },
    ]);

    const loads = await service.dayLoads(
      'location-1',
      ['anna'],
      '2026-11-10',
      '2026-11-11',
      'Europe/Minsk',
    );

    expect(loads.get('anna')?.get('2026-11-11')).toBe(1);
    expect(loads.get('anna')?.get('2026-11-10')).toBeUndefined();
  });

  it('reads the whole range in location time', async () => {
    const { service, db } = setup();

    await service.dayLoads(
      'location-1',
      ['anna'],
      '2026-11-10',
      '2026-11-12',
      'Europe/Minsk',
    );

    const [{ where }] = db.bookingItem.groupBy.mock.calls[0] as unknown as [
      { where: { startAt: { gte: Date; lt: Date }; staffId: object } },
    ];
    expect(where.startAt.gte.toISOString()).toBe('2026-11-09T21:00:00.000Z');
    expect(where.startAt.lt.toISOString()).toBe('2026-11-12T21:00:00.000Z');
    expect(where.staffId).toEqual({ in: ['anna'] });
  });

  it('does not query without staff', async () => {
    const { service, db } = setup();

    const loads = await service.dayLoads(
      'location-1',
      [],
      '2026-11-10',
      '2026-11-10',
      'UTC',
    );

    expect(loads.size).toBe(0);
    expect(db.bookingItem.groupBy).not.toHaveBeenCalled();
  });
});

describe('BookingStaffLoadService.lastAssignedAt', () => {
  it('maps each staff member to when they last got a booking, one query', async () => {
    const { service, db } = setup(
      [],
      [
        { staffId: 'anna', lastAssignedAt: new Date('2026-11-01T10:00:00Z') },
        { staffId: 'boris', lastAssignedAt: new Date('2026-11-05T10:00:00Z') },
      ],
    );

    const result = await service.lastAssignedAt('location-1', [
      'anna',
      'boris',
      'carl',
    ]);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      new Map([
        ['anna', Date.parse('2026-11-01T10:00:00Z')],
        ['boris', Date.parse('2026-11-05T10:00:00Z')],
      ]),
    );
  });

  it('does not query without staff', async () => {
    const { service, db } = setup();

    await expect(service.lastAssignedAt('location-1', [])).resolves.toEqual(
      new Map(),
    );
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});

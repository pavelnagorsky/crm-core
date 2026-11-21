import { DatabaseService } from '../../../../database/database.service.js';
import { BookingVisitsService } from './booking-visits.service.js';

describe('BookingVisitsService.findByBookingIds', () => {
  const setup = (rows: unknown[] = []) => {
    const db = { booking: { findMany: vi.fn().mockResolvedValue(rows) } };
    return {
      db,
      service: new BookingVisitsService(db as unknown as DatabaseService),
    };
  };

  it('skips the query without ids', async () => {
    const { db, service } = setup();
    await expect(service.findByBookingIds('loc', [])).resolves.toEqual(
      new Map(),
    );
    expect(db.booking.findMany).not.toHaveBeenCalled();
  });

  it('reads live bookings of the location with services in booking order', async () => {
    const startAt = new Date('2026-03-05T11:00:00Z');
    const { db, service } = setup([
      {
        id: 'b1',
        startAt,
        items: [
          { serviceId: 's-cut', serviceTitle: 'Стрижка и укладка' },
          { serviceId: 's-color', serviceTitle: 'Окрашивание' },
        ],
      },
    ]);
    const visits = await service.findByBookingIds('loc', ['b1', 'b2']);

    expect(db.booking.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1', 'b2'] }, locationId: 'loc', deletedAt: null },
      select: {
        id: true,
        startAt: true,
        items: {
          select: { serviceId: true, serviceTitle: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    expect(visits).toEqual(
      new Map([
        [
          'b1',
          {
            startAt,
            services: [
              { id: 's-cut', name: 'Стрижка и укладка' },
              { id: 's-color', name: 'Окрашивание' },
            ],
          },
        ],
      ]),
    );
  });
});

describe('BookingVisitsService.startAtByBookingIds', () => {
  it('reads starts of the location bookings, deleted ones included', async () => {
    const startAt = new Date('2026-03-05T11:00:00Z');
    const db = {
      booking: {
        findMany: vi.fn().mockResolvedValue([{ id: 'b1', startAt }]),
      },
    };
    const service = new BookingVisitsService(db as unknown as DatabaseService);
    const result = await service.startAtByBookingIds('loc', ['b1', 'b1', 'b2']);
    expect(db.booking.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1', 'b2'] }, locationId: 'loc' },
      select: { id: true, startAt: true },
    });
    expect(result).toEqual(new Map([['b1', startAt]]));
  });

  it('skips the query without ids', async () => {
    const db = { booking: { findMany: vi.fn() } };
    const service = new BookingVisitsService(db as unknown as DatabaseService);
    await expect(service.startAtByBookingIds('loc', [])).resolves.toEqual(
      new Map(),
    );
    expect(db.booking.findMany).not.toHaveBeenCalled();
  });
});

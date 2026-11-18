import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ServiceCatalogKind } from '../../../services/enums/service-catalog-kind.enum.js';
import { ClientBookingSummaryResponseDto } from '../../dto/client-booking-summary-response.dto.js';
import { StaffPopularServicesDto } from '../../dto/staff-popular-services.dto.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingHistoryReadService } from './booking-history-read.service.js';

const now = new Date('2026-11-18T12:00:00.000Z');

const visit = (id: string, locationId: string, bundleId: string | null) => ({
  id,
  locationId,
  status: BookingStatus.COMPLETED,
  startAt: new Date('2026-11-01T10:00:00.000Z'),
  endAt: new Date('2026-11-01T11:30:00.000Z'),
  bundleId,
  items: [
    {
      serviceId: 'haircut',
      serviceTitle: 'Стрижка',
      staffId: 'anna',
      staffName: 'Анна Смирнова',
      chargedPrice: new Prisma.Decimal(40),
      customPrice: null,
    },
    {
      serviceId: 'styling',
      serviceTitle: 'Укладка',
      staffId: 'anna',
      staffName: 'Анна Смирнова',
      chargedPrice: new Prisma.Decimal(30),
      customPrice: new Prisma.Decimal(25),
    },
  ],
});

function setup() {
  const db = {
    booking: {
      groupBy: vi.fn().mockResolvedValue([
        { status: BookingStatus.COMPLETED, _count: { _all: 14 } },
        { status: BookingStatus.NO_SHOW, _count: { _all: 1 } },
      ]),
      count: vi.fn().mockResolvedValue(2),
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
  const locations = {
    findById: vi.fn().mockResolvedValue({ id: 'here', brandId: 'brand-1' }),
  };
  const clients = {
    findInBrand: vi.fn().mockResolvedValue({ id: 'client-1' }),
  };
  const catalog = {
    findBundleTitles: vi
      .fn()
      .mockResolvedValue(new Map([['bundle-1', 'Стрижка и укладка']])),
  };
  const service = new BookingHistoryReadService(
    db as never,
    locations as never,
    clients as never,
    catalog as never,
  );
  return { service, db, locations, clients, catalog };
}

describe('BookingHistoryReadService.clientSummary', () => {
  it('summarises brand-wide history with the last visit here and the next booking', async () => {
    const { service, db, catalog } = setup();
    const elsewhere = visit('b-elsewhere', 'other', 'bundle-1');
    const here = visit('b-here', 'here', null);
    const next = {
      ...visit('b-next', 'here', null),
      status: BookingStatus.CONFIRMED,
    };
    db.booking.findFirst
      .mockResolvedValueOnce(elsewhere)
      .mockResolvedValueOnce(here)
      .mockResolvedValueOnce(next);
    db.$queryRaw
      .mockResolvedValueOnce([
        {
          staffId: null,
          kind: ServiceCatalogKind.SERVICE,
          id: 'haircut',
          locationId: 'here',
          title: 'Стрижка',
          count: 9,
          lastAt: new Date('2026-11-01T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          staffId: null,
          kind: ServiceCatalogKind.BUNDLE,
          id: 'bundle-1',
          locationId: 'other',
          title: null,
          count: 5,
          lastAt: new Date('2026-11-01T10:00:00.000Z'),
        },
      ]);

    const dto = ClientBookingSummaryResponseDto.fromSummary(
      await service.clientSummary('here', 'client-1', now),
    );

    expect(dto.visits).toBe(14);
    expect(dto.noShows).toBe(1);
    expect(dto.upcomingCount).toBe(2);
    expect(dto.lastVisit).toMatchObject({
      bookingId: 'b-elsewhere',
      locationId: 'other',
      bundleTitle: 'Стрижка и укладка',
      total: '65.00',
      items: [
        {
          serviceId: 'haircut',
          title: 'Стрижка',
          staffId: 'anna',
          staffName: 'Анна Смирнова',
        },
        expect.objectContaining({ serviceId: 'styling' }),
      ],
    });
    expect(dto.lastLocationVisit?.bookingId).toBe('b-here');
    expect(dto.upcoming).toMatchObject({
      bookingId: 'b-next',
      status: BookingStatus.CONFIRMED,
    });
    expect(dto.services).toEqual([
      expect.objectContaining({ kind: 'SERVICE', id: 'haircut', count: 9 }),
    ]);
    expect(dto.bundles).toEqual([
      expect.objectContaining({
        kind: 'BUNDLE',
        id: 'bundle-1',
        title: 'Стрижка и укладка',
        locationId: 'other',
      }),
    ]);
    expect(catalog.findBundleTitles).toHaveBeenCalledWith(['bundle-1']);

    const [completedQuery, hereQuery, nextQuery] =
      db.booking.findFirst.mock.calls.map(([args]) => args);
    expect(completedQuery.where).toMatchObject({
      clientId: 'client-1',
      deletedAt: null,
      status: BookingStatus.COMPLETED,
    });
    expect(completedQuery.where.locationId).toBeUndefined();
    expect(hereQuery.where).toMatchObject({ locationId: 'here' });
    expect(nextQuery.where).toMatchObject({
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      startAt: { gt: now },
    });
    expect(nextQuery.orderBy[0]).toEqual({ startAt: 'asc' });
    const serviceSql = (db.$queryRaw.mock.calls[0][0] as Prisma.Sql).sql;
    expect(serviceSql).toContain(`b."status" = 'COMPLETED'`);
    expect(serviceSql).toContain('b."bundleId" IS NULL');
    expect(serviceSql).toContain('COUNT(DISTINCT b."id")');
  });

  it('returns an empty history for a new client', async () => {
    const { service, db } = setup();
    db.booking.groupBy.mockResolvedValue([]);
    db.booking.count.mockResolvedValue(0);
    db.booking.findFirst.mockResolvedValue(null);
    db.$queryRaw.mockResolvedValue([]);

    expect(await service.clientSummary('here', 'client-1', now)).toEqual({
      visits: 0,
      noShows: 0,
      lastVisit: null,
      lastLocationVisit: null,
      upcoming: null,
      upcomingCount: 0,
      services: [],
      bundles: [],
    });
  });

  it('rejects a client of another brand before reading bookings', async () => {
    const { service, db, clients } = setup();
    clients.findInBrand.mockRejectedValue(
      new NotFoundException('Client not found'),
    );
    await expect(
      service.clientSummary('here', 'client-x', now),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(clients.findInBrand).toHaveBeenCalledWith('brand-1', 'client-x');
    expect(db.booking.findFirst).not.toHaveBeenCalled();
  });
});

describe('BookingHistoryReadService.popularServices', () => {
  it('groups ranked rows by staff and names bundles from the catalog', async () => {
    const { service, db } = setup();
    db.$queryRaw.mockResolvedValue([
      {
        staffId: 'anna',
        kind: ServiceCatalogKind.BUNDLE,
        id: 'bundle-1',
        locationId: 'here',
        title: null,
        count: 7,
        lastAt: now,
      },
      {
        staffId: 'anna',
        kind: ServiceCatalogKind.SERVICE,
        id: 'haircut',
        locationId: 'here',
        title: 'Стрижка',
        count: 3,
        lastAt: now,
      },
      {
        staffId: 'boris',
        kind: ServiceCatalogKind.SERVICE,
        id: 'shave',
        locationId: 'here',
        title: 'Бритьё',
        count: 1,
        lastAt: now,
      },
    ]);

    const result = (await service.popularServices('here', now)).map(
      StaffPopularServicesDto.fromEntity,
    );

    expect(result.map((entry) => entry.staffId)).toEqual(['anna', 'boris']);
    expect(result[0].items.map((item) => [item.kind, item.title])).toEqual([
      ['BUNDLE', 'Стрижка и укладка'],
      ['SERVICE', 'Стрижка'],
    ]);
    const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain('ROW_NUMBER() OVER');
    expect(query.values).toContain('here');
    expect(query.values).toContainEqual(new Date('2026-08-20T12:00:00.000Z'));
    expect(query.values).toContain(6);
  });
});

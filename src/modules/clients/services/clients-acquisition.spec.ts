import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client } from '@prisma/client';
import { ACTIVE_BRAND_WHERE } from '../../../shared/database/active-business.where.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { ClientSearchRequestDto } from '../dto/client-search-request.dto.js';
import { CreateClientDto } from '../dto/create-client.dto.js';
import { UpdateClientDto } from '../dto/update-client.dto.js';
import { ClientsService } from './clients.service.js';

const actor = { id: 'user-1', name: 'Ольга', role: AuditActorRole.OWNER };
const acquiredAt = new Date('2026-11-20T09:00:00.000Z');

function stored(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    brandId: 'brand-1',
    userId: null,
    firstName: 'Анна',
    lastName: 'Иванова',
    phone: '+375291112233',
    email: null,
    birthDate: null,
    gender: null,
    notes: null,
    servicesDiscountPercent: null,
    productsDiscountPercent: null,
    bannedAt: null,
    banReason: null,
    acquisitionSource: null,
    acquisitionSourceDetail: null,
    acquisitionBookingId: null,
    acquiredAt: null,
    importedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setup() {
  const db = {
    client: {
      create: vi.fn(async ({ data }) => stored(data)),
      update: vi.fn(async ({ data }) => stored(data)),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      createManyAndReturn: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
  };
  const service = new ClientsService(
    db as never,
    {
      emit: vi.fn(),
    } as unknown as EventEmitter2,
  );
  return { db, service, tx: db as never };
}

describe('ClientsService.recordAcquisition', () => {
  const acquisition = {
    bookingId: 'b1',
    source: TrafficSource.INSTAGRAM,
    detail: 'bio',
    acquiredAt,
  };

  it('takes the booking source for a client acquired for the first time', async () => {
    const { db, service, tx } = setup();
    db.client.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.recordAcquisition('c1', acquisition, tx),
    ).resolves.toBe(true);

    expect(db.client.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: 'c1',
        acquiredAt: null,
        importedAt: null,
        acquisitionSource: null,
      },
      data: {
        acquisitionBookingId: 'b1',
        acquiredAt,
        acquisitionSource: TrafficSource.INSTAGRAM,
        acquisitionSourceDetail: 'bio',
      },
    });
  });

  it('keeps a source staff set on the profile', async () => {
    const { db, service, tx } = setup();
    db.client.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      service.recordAcquisition('c1', acquisition, tx),
    ).resolves.toBe(true);

    expect(db.client.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'c1', acquiredAt: null, importedAt: null },
      data: { acquisitionBookingId: 'b1', acquiredAt },
    });
  });

  it('leaves an acquired or imported client as is', async () => {
    const { db, service, tx } = setup();
    db.client.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.recordAcquisition('c1', acquisition, tx),
    ).resolves.toBe(false);
    expect(db.client.updateMany).toHaveBeenCalledTimes(2);
    for (const [args] of db.client.updateMany.mock.calls)
      expect(args.where).toMatchObject({ acquiredAt: null, importedAt: null });
  });
});

describe('ClientsService acquisition booking changes', () => {
  it('syncs the source only while the booking is the acquisition booking', async () => {
    const { db, service, tx } = setup();
    db.client.updateMany.mockResolvedValue({ count: 1 });

    await service.syncAcquisitionSource(
      'c1',
      'b1',
      TrafficSource.REFERRAL,
      'анна',
      tx,
    );

    expect(db.client.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'c1', acquisitionBookingId: 'b1' },
      data: {
        acquisitionSource: TrafficSource.REFERRAL,
        acquisitionSourceDetail: 'анна',
      },
    });
  });

  it('clears the acquisition of a client whose first booking moved away', async () => {
    const { db, service, tx } = setup();
    db.client.updateMany.mockResolvedValue({ count: 1 });

    await service.clearAcquisitionBooking('c1', 'b1', tx);

    expect(db.client.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'c1', acquisitionBookingId: 'b1' },
      data: {
        acquisitionBookingId: null,
        acquiredAt: null,
        acquisitionSource: null,
        acquisitionSourceDetail: null,
      },
    });
  });

  it('counts clients of an active brand acquired in the period by source', async () => {
    const { db, service } = setup();
    db.client.groupBy.mockResolvedValue([
      { acquisitionSource: 'VK', _count: { _all: 2 } },
      { acquisitionSource: null, _count: { _all: 1 } },
    ]);
    const from = new Date('2026-11-01T00:00:00.000Z');
    const to = new Date('2026-12-01T00:00:00.000Z');

    await expect(
      service.countAcquiredBySource('brand-1', from, to),
    ).resolves.toEqual([
      { source: 'VK', count: 2 },
      { source: null, count: 1 },
    ]);
    expect(db.client.groupBy).toHaveBeenCalledWith({
      by: ['acquisitionSource'],
      where: {
        brandId: 'brand-1',
        brand: ACTIVE_BRAND_WHERE,
        acquiredAt: { gte: from, lt: to },
      },
      _count: { _all: true },
    });
  });
});

describe('ClientsService acquisition source edits', () => {
  const base = {
    firstName: 'Анна',
    lastName: 'Иванова',
    phone: '+375291112233',
  };

  it('stores a source staff know on create', async () => {
    const { db, service } = setup();

    await service.create(
      'brand-1',
      {
        ...base,
        acquisitionSource: TrafficSource.WALK_IN,
        acquisitionSourceDetail: ' вывеска ',
      } as CreateClientDto,
      actor,
    );

    expect(db.client.create.mock.calls[0][0].data).toMatchObject({
      acquisitionSource: TrafficSource.WALK_IN,
      acquisitionSourceDetail: 'вывеска',
    });
  });

  it.each<
    [
      string,
      Partial<UpdateClientDto>,
      {
        acquisitionSource: TrafficSource | null;
        acquisitionSourceDetail: string | null;
      },
    ]
  >([
    [
      'keeps both when omitted',
      {},
      {
        acquisitionSource: TrafficSource.VK,
        acquisitionSourceDetail: 'группа',
      },
    ],
    [
      'drops the detail when the source changes alone',
      { acquisitionSource: TrafficSource.TELEGRAM },
      {
        acquisitionSource: TrafficSource.TELEGRAM,
        acquisitionSourceDetail: null,
      },
    ],
    [
      'takes a new detail with the source',
      {
        acquisitionSource: TrafficSource.TELEGRAM,
        acquisitionSourceDetail: 'канал',
      },
      {
        acquisitionSource: TrafficSource.TELEGRAM,
        acquisitionSourceDetail: 'канал',
      },
    ],
    [
      'changes the detail alone',
      { acquisitionSourceDetail: 'паблик' },
      {
        acquisitionSource: TrafficSource.VK,
        acquisitionSourceDetail: 'паблик',
      },
    ],
    [
      'clears both with a null source',
      { acquisitionSource: null },
      { acquisitionSource: null, acquisitionSourceDetail: null },
    ],
  ])('on update %s', async (_name, fields, expected) => {
    const { db, service } = setup();
    db.client.findFirst.mockResolvedValue(
      stored({
        acquisitionSource: TrafficSource.VK,
        acquisitionSourceDetail: 'группа',
      }),
    );

    await service.update(
      'brand-1',
      'c1',
      { ...base, ...fields } as UpdateClientDto,
      actor,
    );

    expect(db.client.update.mock.calls[0][0].data).toMatchObject(expected);
  });

  it('rejects a detail without a source', async () => {
    const { db, service } = setup();
    db.client.findFirst.mockResolvedValue(stored());

    await expect(
      service.update(
        'brand-1',
        'c1',
        { ...base, acquisitionSourceDetail: 'x' } as UpdateClientDto,
        actor,
      ),
    ).rejects.toMatchObject({
      errorCode: 'TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE',
    });
    expect(db.client.update).not.toHaveBeenCalled();
  });
});

describe('ClientsService import and search', () => {
  it('marks imported clients so their first booking is not an acquisition', async () => {
    const { db, service } = setup();

    await service.insertImported(
      'brand-1',
      [
        {
          firstName: 'Анна',
          lastName: 'Иванова',
          phone: '+375291112233',
          email: null,
          birthDate: null,
          gender: null,
          notes: null,
          servicesDiscountPercent: null,
          productsDiscountPercent: null,
        },
      ],
      actor,
    );

    expect(
      db.client.createManyAndReturn.mock.calls[0][0].data[0],
    ).toMatchObject({ importedAt: expect.any(Date) });
  });

  it('filters clients by acquisition source', async () => {
    const { db, service } = setup();

    await service.search('brand-1', {
      page: 1,
      pageSize: 10,
      acquisitionSources: [TrafficSource.INSTAGRAM, TrafficSource.VK],
    } as ClientSearchRequestDto);

    expect(db.client.findMany.mock.calls[0][0].where).toMatchObject({
      acquisitionSource: { in: [TrafficSource.INSTAGRAM, TrafficSource.VK] },
    });
  });
});

describe('ClientsService.resolveForBooking race', () => {
  it('reads the client a concurrent first booking created', async () => {
    const winner = stored({ id: 'winner' });
    const upsert = vi.fn().mockRejectedValue({ code: 'P2002' });
    const findUniqueOrThrow = vi.fn().mockResolvedValue(winner);
    const service = new ClientsService(
      { client: { upsert, findUniqueOrThrow } } as never,
      {} as never,
    );

    await expect(
      service.resolveForBooking('brand-1', '+375291112233', 'Анна', ''),
    ).resolves.toBe(winner);
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { brandId_phone: { brandId: 'brand-1', phone: '+375291112233' } },
    });
  });

  it('rethrows other errors', async () => {
    const service = new ClientsService(
      {
        client: { upsert: vi.fn().mockRejectedValue(new Error('down')) },
      } as never,
      {} as never,
    );
    await expect(
      service.resolveForBooking('brand-1', '+375291112233', 'Анна', ''),
    ).rejects.toThrow('down');
  });
});

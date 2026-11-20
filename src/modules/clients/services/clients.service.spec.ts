import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client } from '@prisma/client';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { ClientSearchRequestDto } from '../dto/client-search-request.dto.js';
import { ClientImportRow } from '../import/interfaces/client-import-row.interface.js';
import { ClientsService } from './clients.service.js';

const actor: AuditActor = {
  id: 'user-1',
  name: 'Ольга',
  role: AuditActorRole.OWNER,
};

const row: ClientImportRow = {
  firstName: 'Анна',
  lastName: 'Иванова',
  phone: '+375291112233',
  email: null,
  birthDate: null,
  gender: null,
  notes: null,
};

describe('ClientsService automatic booking registration', () => {
  it('creates a missing client or reuses an existing card without changing its contacts', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'client-1' });
    const service = new ClientsService(
      { client: { upsert } } as never,
      {} as never,
    );

    await expect(
      service.resolveForBooking(
        'brand-1',
        '+375291112233',
        'Анна',
        'Иванова',
        'anna@example.com',
      ),
    ).resolves.toEqual({ id: 'client-1' });
    expect(upsert).toHaveBeenCalledWith({
      where: { brandId_phone: { brandId: 'brand-1', phone: '+375291112233' } },
      update: {},
      create: {
        brandId: 'brand-1',
        phone: '+375291112233',
        firstName: 'Анна',
        lastName: 'Иванова',
        email: 'anna@example.com',
      },
    });
  });
});

describe('ClientsService.insertImported', () => {
  const createManyAndReturn = vi.fn();
  const emit = vi.fn();
  const service = new ClientsService(
    { client: { createManyAndReturn } } as never,
    { emit } as unknown as EventEmitter2,
  );

  beforeEach(() => {
    createManyAndReturn.mockReset();
    emit.mockReset();
  });

  it('writes a CLIENT_CREATED audit event for each inserted client', async () => {
    createManyAndReturn.mockResolvedValue([
      {
        id: 'c1',
        firstName: 'Анна',
        lastName: 'Иванова',
        phone: '+375291112233',
      },
    ]);

    await expect(
      service.insertImported('business-1', [row], actor),
    ).resolves.toBe(1);

    expect(emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        brandId: 'business-1',
        entityType: AuditEntity.CLIENT,
        entityId: 'c1',
        eventType: AuditEvent.CLIENT_CREATED,
        actionType: AuditActionType.CREATE,
        actor,
        payload: { fullName: 'Анна Иванова', phone: '+375291112233' },
      }),
    );
  });

  it('does not write audit events for rows skipped as duplicates', async () => {
    createManyAndReturn.mockResolvedValue([]);

    await expect(
      service.insertImported('business-1', [row], actor),
    ).resolves.toBe(0);

    expect(emit).not.toHaveBeenCalled();
  });
});

function storedClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    brandId: 'business-1',
    userId: null,
    firstName: 'Анна',
    lastName: 'Иванова',
    phone: '+375291112233',
    email: null,
    birthDate: null,
    gender: null,
    notes: null,
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

describe('ClientsService.setBan', () => {
  const findFirst = vi.fn();
  const update = vi.fn();
  const emit = vi.fn();
  const service = new ClientsService(
    { client: { findFirst, update } } as never,
    { emit } as unknown as EventEmitter2,
  );
  let current: Client;

  beforeEach(() => {
    findFirst.mockReset();
    update.mockReset();
    emit.mockReset();
    current = storedClient();
    findFirst.mockImplementation(async () => current);
    update.mockImplementation(async (args: { data: Partial<Client> }) => ({
      ...current,
      ...args.data,
    }));
  });

  it('bans a client and records the reason', async () => {
    await service.setBan(
      'business-1',
      'c1',
      { banned: true, reason: '  три неявки  ' },
      actor,
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { bannedAt: expect.any(Date), banReason: 'три неявки' },
    });
    expect(emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        entityType: AuditEntity.CLIENT,
        entityId: 'c1',
        eventType: AuditEvent.CLIENT_UPDATED,
        actionType: AuditActionType.MODIFY,
        payload: {
          changes: expect.arrayContaining([
            expect.objectContaining({ field: 'bannedAt', from: '—' }),
            expect.objectContaining({
              field: 'banReason',
              from: '—',
              to: 'три неявки',
            }),
          ]),
        },
      }),
    );
  });

  it('keeps the original ban time when only the reason changes', async () => {
    const bannedAt = new Date('2026-09-01T00:00:00.000Z');
    current = storedClient({ bannedAt, banReason: 'старая' });

    await service.setBan(
      'business-1',
      'c1',
      { banned: true, reason: 'новая' },
      actor,
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { bannedAt, banReason: 'новая' },
    });
  });

  it('clears the ban', async () => {
    current = storedClient({
      bannedAt: new Date('2026-09-01T00:00:00.000Z'),
      banReason: 'три неявки',
    });

    await service.setBan('business-1', 'c1', { banned: false }, actor);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { bannedAt: null, banReason: null },
    });
  });

  it('rejects a repeated ban with the same reason', async () => {
    current = storedClient({
      bannedAt: new Date('2026-09-01T00:00:00.000Z'),
      banReason: 'три неявки',
    });

    await expect(
      service.setBan(
        'business-1',
        'c1',
        { banned: true, reason: 'три неявки' },
        actor,
      ),
    ).rejects.toMatchObject({ errorCode: 'CLIENT_BAN_ALREADY_SET' });
    expect(update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a ban without a reason', async () => {
    await expect(
      service.setBan(
        'business-1',
        'c1',
        { banned: true, reason: '   ' },
        actor,
      ),
    ).rejects.toMatchObject({ errorCode: 'BAD_REQUEST' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ClientsService.search ban filter', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const service = new ClientsService(
    {
      client: { findMany, count },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    } as never,
    { emit: vi.fn() } as unknown as EventEmitter2,
  );

  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  async function search(banned?: boolean) {
    await service.search('business-1', {
      brandId: 'business-1',
      page: 1,
      pageSize: 25,
      banned,
    } as ClientSearchRequestDto);
  }

  it('returns every client when the ban filter is omitted', async () => {
    await search();
    expect(findMany.mock.calls[0][0].where).toEqual({
      brand: { deletedAt: null },
      brandId: 'business-1',
    });
  });

  it('returns only banned clients', async () => {
    await search(true);
    expect(findMany.mock.calls[0][0].where).toEqual({
      brand: { deletedAt: null },
      brandId: 'business-1',
      bannedAt: { not: null },
    });
  });

  it('matches name, phone, email, notes, gender and ban reason', async () => {
    await service.search('business-1', {
      brandId: 'business-1',
      page: 1,
      pageSize: 25,
      search: '  анна  ',
    } as ClientSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      brand: { deletedAt: null },
      brandId: 'business-1',
      OR: [
        { firstName: { contains: 'анна', mode: 'insensitive' } },
        { lastName: { contains: 'анна', mode: 'insensitive' } },
        { phone: { contains: 'анна' } },
        { email: { contains: 'анна', mode: 'insensitive' } },
        { notes: { contains: 'анна', mode: 'insensitive' } },
        { gender: { contains: 'анна', mode: 'insensitive' } },
        { banReason: { contains: 'анна', mode: 'insensitive' } },
      ],
    });
  });

  it('matches first and last name search terms in any order', async () => {
    await service.search('business-1', {
      brandId: 'business-1',
      page: 1,
      pageSize: 25,
      search: '  Андреева   яна  ',
    } as ClientSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      brand: { deletedAt: null },
      brandId: 'business-1',
      OR: [
        { firstName: { contains: 'Андреева   яна', mode: 'insensitive' } },
        { lastName: { contains: 'Андреева   яна', mode: 'insensitive' } },
        { phone: { contains: 'Андреева   яна' } },
        { email: { contains: 'Андреева   яна', mode: 'insensitive' } },
        { notes: { contains: 'Андреева   яна', mode: 'insensitive' } },
        { gender: { contains: 'Андреева   яна', mode: 'insensitive' } },
        { banReason: { contains: 'Андреева   яна', mode: 'insensitive' } },
        {
          AND: [
            {
              OR: [
                { firstName: { contains: 'Андреева', mode: 'insensitive' } },
                { lastName: { contains: 'Андреева', mode: 'insensitive' } },
              ],
            },
            {
              OR: [
                { firstName: { contains: 'яна', mode: 'insensitive' } },
                { lastName: { contains: 'яна', mode: 'insensitive' } },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns only clients who can book online', async () => {
    await search(false);
    expect(findMany.mock.calls[0][0].where).toEqual({
      brand: { deletedAt: null },
      brandId: 'business-1',
      bannedAt: null,
    });
  });
});

describe('ClientsService.search by phone', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const service = new ClientsService(
    {
      client: { findMany, count },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    } as never,
    { emit: vi.fn() } as unknown as EventEmitter2,
  );
  const client = (id: string) => ({ id }) as Client;

  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
  });

  function search(page: number, pageSize: number, phone = '8029233') {
    return service.search('business-1', {
      page,
      pageSize,
      phone,
    } as ClientSearchRequestDto);
  }

  it('lists numbers that start with the typed digits first and counts both groups', async () => {
    count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    findMany
      .mockResolvedValueOnce([client('starts-1'), client('starts-2')])
      .mockResolvedValueOnce([client('inside-1'), client('inside-2')]);

    const result = await search(1, 4);

    expect(result.totalItems).toBe(7);
    expect(result.items.map((item) => item.id)).toEqual([
      'starts-1',
      'starts-2',
      'inside-1',
      'inside-2',
    ]);
    const [first, rest] = findMany.mock.calls.map(([args]) => args);
    expect(first).toMatchObject({ skip: 0, take: 2 });
    expect(rest).toMatchObject({ skip: 0, take: 2 });
    expect(JSON.stringify(first.where)).toContain('"startsWith":"+37529233"');
    expect(rest.where.AND[1]).toEqual({
      OR: [
        { phone: { contains: '8029233' } },
        { phone: { startsWith: '+37529233' } },
      ],
    });
    expect(rest.where.AND[2]).toEqual({ NOT: first.where.AND[1] });
    expect(rest.where.AND[0]).toEqual({
      brand: { deletedAt: null },
      brandId: 'business-1',
    });
  });

  it('pages into the other numbers once the first group is exhausted', async () => {
    count.mockResolvedValueOnce(2).mockResolvedValueOnce(10);
    findMany.mockResolvedValueOnce([client('inside-5')]);

    await search(2, 6);

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 4, take: 6 });
  });

  it('skips the other numbers when the first group fills the page', async () => {
    count.mockResolvedValueOnce(9).mockResolvedValueOnce(3);
    findMany.mockResolvedValueOnce([]);

    await search(1, 6);

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 6 });
  });
});

describe('ClientsService.search with a typed phone', () => {
  it('finds a formatted number in the general search by its digits', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ClientsService(
      {
        client: { findMany, count: vi.fn().mockResolvedValue(0) },
        $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      } as never,
      { emit: vi.fn() } as unknown as EventEmitter2,
    );
    await service.search('business-1', {
      page: 1,
      pageSize: 25,
      search: '+375 (29) 233',
    } as ClientSearchRequestDto);
    expect(findMany.mock.calls[0][0].where.OR).toContainEqual({
      phone: { contains: '37529233' },
    });
  });
});

describe('ClientsService email filled while booking', () => {
  const stored = {
    id: 'c1',
    brandId: 'business-1',
    firstName: 'Анна',
    lastName: 'Иванова',
    phone: '+375291112233',
    email: null,
  } as Client;

  it('fills only an empty email inside the given transaction and returns what is stored', async () => {
    const tx = {
      client: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ email: 'other@example.test' }),
      },
    };
    const service = new ClientsService(
      {} as never,
      { emit: vi.fn() } as unknown as EventEmitter2,
    );

    expect(
      await service.fillMissingEmail('c1', 'anna@example.test', tx as never),
    ).toBe('other@example.test');
    expect(tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', email: null },
      data: { email: 'anna@example.test' },
    });
  });

  it('audits only the email change', () => {
    const emit = vi.fn();
    const service = new ClientsService(
      {} as never,
      { emit } as unknown as EventEmitter2,
    );
    service.emitEmailFilled('business-1', stored, 'anna@example.test', actor);
    expect(emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        brandId: 'business-1',
        entityId: 'c1',
        eventType: AuditEvent.CLIENT_UPDATED,
        actor,
        payload: {
          changes: [{ field: 'email', from: '—', to: 'anna@example.test' }],
        },
      }),
    );
  });
});

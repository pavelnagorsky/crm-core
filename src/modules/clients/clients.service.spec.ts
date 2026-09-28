import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client } from '@prisma/client';
import { ClientsService } from './clients.service.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { ClientImportRow } from './clients-import/interfaces/client-import-row.interface.js';
import { ClientSearchRequestDto } from './dto/client-search-request.dto.js';

const actor: AuditActor = { id: 'user-1', name: 'Ольга', role: AuditActorRole.OWNER };

const row: ClientImportRow = {
  firstName: 'Анна',
  lastName: 'Иванова',
  phone: '+375291112233',
  email: null,
  birthDate: null,
  gender: null,
  notes: null,
};

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
      { id: 'c1', firstName: 'Анна', lastName: 'Иванова', phone: '+375291112233' },
    ]);

    await expect(service.insertImported('business-1', [row], actor)).resolves.toBe(1);

    expect(emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        businessId: 'business-1',
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

    await expect(service.insertImported('business-1', [row], actor)).resolves.toBe(0);

    expect(emit).not.toHaveBeenCalled();
  });
});

function storedClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    businessId: 'business-1',
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
    await service.setBan('business-1', 'c1', { banned: true, reason: '  три неявки  ' }, actor);

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
            expect.objectContaining({ field: 'banReason', from: '—', to: 'три неявки' }),
          ]),
        },
      }),
    );
  });

  it('keeps the original ban time when only the reason changes', async () => {
    const bannedAt = new Date('2026-09-01T00:00:00.000Z');
    current = storedClient({ bannedAt, banReason: 'старая' });

    await service.setBan('business-1', 'c1', { banned: true, reason: 'новая' }, actor);

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
      service.setBan('business-1', 'c1', { banned: true, reason: 'три неявки' }, actor),
    ).rejects.toMatchObject({ errorCode: 'CLIENT_BAN_ALREADY_SET' });
    expect(update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a ban without a reason', async () => {
    await expect(
      service.setBan('business-1', 'c1', { banned: true, reason: '   ' }, actor),
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
      businessId: 'business-1',
      page: 1,
      pageSize: 25,
      banned,
    } as ClientSearchRequestDto);
  }

  it('returns every client when the ban filter is omitted', async () => {
    await search();
    expect(findMany.mock.calls[0][0].where).toEqual({ businessId: 'business-1' });
  });

  it('returns only banned clients', async () => {
    await search(true);
    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'business-1',
      bannedAt: { not: null },
    });
  });

  it('matches name, phone, email, notes, gender and ban reason', async () => {
    await service.search('business-1', {
      businessId: 'business-1',
      page: 1,
      pageSize: 25,
      search: '  анна  ',
    } as ClientSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'business-1',
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

  it('returns only clients who can book online', async () => {
    await search(false);
    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'business-1',
      bannedAt: null,
    });
  });
});

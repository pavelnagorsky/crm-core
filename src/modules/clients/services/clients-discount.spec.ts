import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, Prisma } from '@prisma/client';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { UpdateClientDto } from '../dto/update-client.dto.js';
import { ClientsService } from './clients.service.js';

const actor = {} as AuditActor;

function stored(discountPercent: string | null): Client {
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
    bannedAt: null,
    banReason: null,
    acquisitionSource: null,
    acquisitionSourceDetail: null,
    acquisitionBookingId: null,
    acquiredAt: null,
    importedAt: null,
    discountPercent:
      discountPercent === null ? null : new Prisma.Decimal(discountPercent),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

const dto = (discountPercent?: string | null): UpdateClientDto =>
  Object.assign(new UpdateClientDto(), {
    firstName: 'Анна',
    lastName: 'Иванова',
    phone: '+375291112233',
    ...(discountPercent !== undefined && { discountPercent }),
  });

describe('ClientsService personal discount (docs/pricing-stage4-api.md)', () => {
  const findFirst = vi.fn();
  const update = vi.fn();
  const create = vi.fn();
  const emit = vi.fn();
  const service = new ClientsService(
    { client: { findFirst, update, create } } as never,
    { emit } as unknown as EventEmitter2,
  );
  let current: Client;

  beforeEach(() => {
    vi.clearAllMocks();
    current = stored('10.00');
    findFirst.mockImplementation(async () => current);
    update.mockImplementation(async (args: { data: Partial<Client> }) => ({
      ...current,
      ...args.data,
      discountPercent:
        args.data.discountPercent === undefined
          ? current.discountPercent
          : args.data.discountPercent === null
            ? null
            : new Prisma.Decimal(String(args.data.discountPercent)),
    }));
    create.mockImplementation(async (args: { data: Partial<Client> }) => ({
      ...stored(null),
      ...args.data,
    }));
  });

  it('keeps the discount when it is omitted', async () => {
    await service.update('brand-1', 'c1', dto(), actor);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('discountPercent');
    expect(emit).not.toHaveBeenCalled();
  });

  it('clears it with null and audits the change', async () => {
    await service.update('brand-1', 'c1', dto(null), actor);
    expect(update.mock.calls[0][0].data.discountPercent).toBeNull();
    expect(emit.mock.calls[0][1].payload.changes).toEqual([
      { field: 'discountPercent', from: '10', to: '—' },
    ]);
  });

  it('sets a new percent', async () => {
    await service.update('brand-1', 'c1', dto('15.50'), actor);
    expect(update.mock.calls[0][0].data.discountPercent).toBe('15.50');
    expect(emit.mock.calls[0][1].payload.changes).toEqual([
      { field: 'discountPercent', from: '10', to: '15.5' },
    ]);
  });

  it('creates a client with a discount or without one', async () => {
    await service.create('brand-1', { ...dto('5.00') }, actor);
    await service.create('brand-1', { ...dto() }, actor);
    expect(create.mock.calls[0][0].data.discountPercent).toBe('5.00');
    expect(create.mock.calls[1][0].data.discountPercent).toBeNull();
  });
});

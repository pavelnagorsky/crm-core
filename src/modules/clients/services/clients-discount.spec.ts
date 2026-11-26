import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, Prisma } from '@prisma/client';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { UpdateClientDto } from '../dto/update-client.dto.js';
import { ClientsService } from './clients.service.js';

const actor = {} as AuditActor;

const decimal = (value: string | null): Prisma.Decimal | null =>
  value === null ? null : new Prisma.Decimal(value);

function stored(
  servicesDiscountPercent: string | null,
  productsDiscountPercent: string | null = null,
): Client {
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
    servicesDiscountPercent: decimal(servicesDiscountPercent),
    productsDiscountPercent: decimal(productsDiscountPercent),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

const dto = (
  servicesDiscountPercent?: string | null,
  productsDiscountPercent?: string | null,
): UpdateClientDto =>
  Object.assign(new UpdateClientDto(), {
    firstName: 'Анна',
    lastName: 'Иванова',
    phone: '+375291112233',
    ...(servicesDiscountPercent !== undefined && { servicesDiscountPercent }),
    ...(productsDiscountPercent !== undefined && { productsDiscountPercent }),
  });

describe('ClientsService personal discount (docs/pricing-stage7-api.md)', () => {
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
    current = stored('10.00', '5.00');
    findFirst.mockImplementation(async () => current);
    update.mockImplementation(async (args: { data: Partial<Client> }) => ({
      ...current,
      ...args.data,
      servicesDiscountPercent:
        args.data.servicesDiscountPercent === undefined
          ? current.servicesDiscountPercent
          : decimal(
              args.data.servicesDiscountPercent === null
                ? null
                : String(args.data.servicesDiscountPercent),
            ),
      productsDiscountPercent:
        args.data.productsDiscountPercent === undefined
          ? current.productsDiscountPercent
          : decimal(
              args.data.productsDiscountPercent === null
                ? null
                : String(args.data.productsDiscountPercent),
            ),
    }));
    create.mockImplementation(async (args: { data: Partial<Client> }) => ({
      ...stored(null),
      ...args.data,
    }));
  });

  it('keeps the discounts when they are omitted', async () => {
    await service.update('brand-1', 'c1', dto(), actor);
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('servicesDiscountPercent');
    expect(data).not.toHaveProperty('productsDiscountPercent');
    expect(emit).not.toHaveBeenCalled();
  });

  it('clears services with null, keeps products and audits the change', async () => {
    await service.update('brand-1', 'c1', dto(null), actor);
    const data = update.mock.calls[0][0].data;
    expect(data.servicesDiscountPercent).toBeNull();
    expect(data).not.toHaveProperty('productsDiscountPercent');
    expect(emit.mock.calls[0][1].payload.changes).toEqual([
      { field: 'servicesDiscountPercent', from: '10', to: '—' },
    ]);
  });

  it('sets new percents independently', async () => {
    await service.update('brand-1', 'c1', dto('15.50', null), actor);
    const data = update.mock.calls[0][0].data;
    expect(data.servicesDiscountPercent).toBe('15.50');
    expect(data.productsDiscountPercent).toBeNull();
    expect(emit.mock.calls[0][1].payload.changes).toEqual([
      { field: 'servicesDiscountPercent', from: '10', to: '15.5' },
      { field: 'productsDiscountPercent', from: '5', to: '—' },
    ]);
  });

  it('creates a client with discounts or without them', async () => {
    await service.create('brand-1', { ...dto('5.00', '7.00') }, actor);
    await service.create('brand-1', { ...dto() }, actor);
    expect(create.mock.calls[0][0].data.servicesDiscountPercent).toBe('5.00');
    expect(create.mock.calls[0][0].data.productsDiscountPercent).toBe('7.00');
    expect(create.mock.calls[1][0].data.servicesDiscountPercent).toBeNull();
    expect(create.mock.calls[1][0].data.productsDiscountPercent).toBeNull();
  });
});

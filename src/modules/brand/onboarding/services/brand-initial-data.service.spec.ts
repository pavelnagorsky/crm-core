import { BusinessType, Prisma, ServiceStatus } from '@prisma/client';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { ServiceCategoriesService } from '../../../services/categories/services/service-categories.service.js';
import { ServiceWriteService } from '../../../services/service-write/services/service-write.service.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { BrandInitialDataService } from './brand-initial-data.service.js';

describe('BrandInitialDataService', () => {
  const tx = {
    serviceCategory: { createManyAndReturn: vi.fn() },
    service: { createManyAndReturn: vi.fn() },
    staff: { create: vi.fn() },
  };
  const db = { $transaction: vi.fn() };
  const locations = { acquireActiveOperationLock: vi.fn(), findById: vi.fn() };
  const users = { findById: vi.fn() };
  const cache = { invalidate: vi.fn() };
  const events = { emit: vi.fn() };
  const categories = new ServiceCategoriesService(
    {} as never,
    events as never,
    cache as never,
  );
  const services = new ServiceWriteService(
    {} as never,
    events as never,
    {} as never,
    cache as never,
  );
  const staff = new StaffService(
    {} as never,
    events as never,
    {} as never,
    {} as never,
    users as never,
    {} as never,
    cache as never,
  );
  const initialData = new BrandInitialDataService(
    db as never,
    locations as never,
    categories,
    services,
    staff,
    cache as never,
    events as never,
  );
  const actor = { id: 'user-1', name: 'Anna', role: AuditActorRole.OWNER };
  const location = {
    id: 'location-1',
    brandId: 'brand-1',
    businessType: BusinessType.BARBERSHOP,
    currency: 'BYN',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
      return result;
    });
    locations.acquireActiveOperationLock.mockResolvedValue(true);
    locations.findById.mockResolvedValue(location);
    users.findById.mockResolvedValue({
      firstName: 'Anna',
      lastName: 'Ivanova',
      email: 'anna@example.com',
      phone: '+375291234567',
    });
    tx.serviceCategory.createManyAndReturn.mockImplementation(
      ({ data }: { data: Prisma.ServiceCategoryCreateManyInput[] }) =>
        Promise.resolve(
          data
            .map((category, i) => ({ ...category, id: `category-${i}` }))
            .reverse(),
        ),
    );
    tx.service.createManyAndReturn.mockImplementation(
      ({ data }: { data: Prisma.ServiceCreateManyInput[] }) =>
        Promise.resolve(
          data.map((service, i) => ({ ...service, id: `service-${i}` })),
        ),
    );
    tx.staff.create.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: 'staff-1' }),
    );
  });

  it('creates inactive priced services, categories and a linked owner in the same transaction', async () => {
    await initialData.populate(location.id, actor.id, actor);

    expect(db.$transaction).toHaveBeenCalledOnce();
    const data = tx.service.createManyAndReturn.mock.calls[0][0].data;
    expect(data).toEqual([
      expect.objectContaining({
        title: 'Мужская стрижка',
        categoryId: 'category-0',
        price: '40',
        durationMinutes: 45,
        status: ServiceStatus.INACTIVE,
      }),
      expect.objectContaining({
        title: 'Стрижка машинкой',
        categoryId: 'category-0',
        price: '25',
        status: ServiceStatus.INACTIVE,
      }),
      expect.objectContaining({
        title: 'Оформление бороды',
        categoryId: 'category-1',
        price: '30',
        status: ServiceStatus.INACTIVE,
      }),
    ]);
    expect(users.findById).toHaveBeenCalledWith(actor.id, tx);
    expect(tx.staff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        locationId: location.id,
        userId: actor.id,
        name: 'Anna Ivanova',
        email: 'anna@example.com',
        phone: '+375291234567',
        staffServices: {
          create: [
            { serviceId: 'service-0' },
            { serviceId: 'service-1' },
            { serviceId: 'service-2' },
          ],
        },
      }),
    });
    expect(cache.invalidate).toHaveBeenCalledWith(
      'services.catalog:location-1',
    );
    expect(cache.invalidate).toHaveBeenCalledWith('staff.directory:location-1');
    expect(cache.invalidate).toHaveBeenCalledWith('staff.schedule:location-1');
    expect(events.emit).toHaveBeenCalledTimes(6);
  });

  it.each(
    Object.values(BusinessType).flatMap((businessType) =>
      ['RUB', 'BYN', 'KZT'].map((currency) => ({ businessType, currency })),
    ),
  )(
    'has valid starter services for $businessType in $currency',
    async ({ businessType, currency }) => {
      locations.findById.mockResolvedValue({
        ...location,
        businessType,
        currency,
      });
      await initialData.populate(location.id, actor.id, actor);
      const data = tx.service.createManyAndReturn.mock.calls[0][0].data;
      expect(data.length).toBeGreaterThanOrEqual(2);
      for (const service of data) {
        expect(service.status).toBe(ServiceStatus.INACTIVE);
        expect(Number(service.price)).toBeGreaterThan(0);
        expect(service.durationMinutes).toBeGreaterThan(0);
        expect(service.categoryId).toBeTruthy();
      }
    },
  );

  it.each([null, undefined])(
    'creates only the owner when the business type is %s',
    async (businessType) => {
      locations.findById.mockResolvedValue({ ...location, businessType });
      await initialData.populate(location.id, actor.id, actor);
      expect(tx.serviceCategory.createManyAndReturn).not.toHaveBeenCalled();
      expect(tx.service.createManyAndReturn).not.toHaveBeenCalled();
      expect(tx.staff.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          locationId: location.id,
          userId: actor.id,
          staffServices: { create: [] },
        }),
      });
      expect(events.emit).toHaveBeenCalledTimes(1);
    },
  );

  it('does not populate a deleted location or brand', async () => {
    locations.acquireActiveOperationLock.mockResolvedValue(false);
    await initialData.populate(location.id, actor.id, actor);
    expect(tx.staff.create).not.toHaveBeenCalled();
    expect(tx.serviceCategory.createManyAndReturn).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it('propagates a transaction failure without publishing audit events or invalidating caches', async () => {
    tx.staff.create.mockRejectedValue(new Error('Staff insert failed'));
    await expect(
      initialData.populate(location.id, actor.id, actor),
    ).rejects.toThrow('Staff insert failed');
    expect(cache.invalidate).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('rejects an unsupported currency before inserting starter data', async () => {
    locations.findById.mockResolvedValue({ ...location, currency: 'USD' });
    await expect(
      initialData.populate(location.id, actor.id, actor),
    ).rejects.toThrow('Unsupported starter catalog currency');
    expect(tx.serviceCategory.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.staff.create).not.toHaveBeenCalled();
  });
});

import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpStatus } from '@nestjs/common';
import { StaffService } from './staff.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { createBillingFacadeStub } from '../../billing/testing/billing-facade.stub.js';

const ACTOR = { type: 'USER', userId: 'user-1' } as never;

function setup(options: { level?: { id: string; isDefault: boolean } | null }) {
  const old = {
    id: 'staff-1',
    locationId: 'loc-1',
    status: 'ACTIVE',
    name: 'A',
    priceLevelId: null,
    staffServices: [{ serviceId: 's1' }, { serviceId: 's2' }],
  };
  const tx = {
    priceLevel: {
      findFirst: vi.fn().mockResolvedValue(options.level ?? null),
    },
    staffService: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    staff: {
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...old,
          priceLevelId: data.priceLevelId ?? old.priceLevelId,
        }),
      ),
    },
  };
  const invalidate = vi.fn().mockResolvedValue(undefined);
  const service = new StaffService(
    { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } as never,
    { emit: vi.fn() } as unknown as EventEmitter2,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { invalidate } as never,
    createBillingFacadeStub(),
  );
  vi.spyOn(service, 'findWithServiceCountInLocation').mockResolvedValue(
    old as never,
  );
  return { service, tx, invalidate };
}

describe('StaffService.update pricing', () => {
  it('syncs services as a diff so untouched rows keep their price', async () => {
    const { service, tx, invalidate } = setup({});
    await service.update(
      'loc-1',
      'staff-1',
      { serviceIds: ['s2', 's3'] },
      ACTOR,
    );

    expect(tx.staffService.deleteMany).toHaveBeenCalledWith({
      where: { staffId: 'staff-1', serviceId: { notIn: ['s2', 's3'] } },
    });
    expect(tx.staffService.createMany).toHaveBeenCalledWith({
      data: [
        { staffId: 'staff-1', serviceId: 's2' },
        { staffId: 'staff-1', serviceId: 's3' },
      ],
      skipDuplicates: true,
    });
    expect(tx.staff.update.mock.calls[0][0].data).not.toHaveProperty(
      'staffServices',
    );
    expect(invalidate).toHaveBeenCalledWith(CacheDependency.pricing('loc-1'));
  });

  it('does not touch services when serviceIds is absent', async () => {
    const { service, tx, invalidate } = setup({});
    await service.update('loc-1', 'staff-1', { name: 'B' }, ACTOR);

    expect(tx.staffService.deleteMany).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalledWith(
      CacheDependency.pricing('loc-1'),
    );
  });

  it('stores a non-default level and invalidates pricing', async () => {
    const { service, tx, invalidate } = setup({
      level: { id: 'lvl-1', isDefault: false },
    });
    await service.update('loc-1', 'staff-1', { priceLevelId: 'lvl-1' }, ACTOR);

    expect(tx.priceLevel.findFirst).toHaveBeenCalledWith({
      where: { id: 'lvl-1', locationId: 'loc-1' },
      select: { id: true, isDefault: true },
    });
    expect(tx.staff.update.mock.calls[0][0].data.priceLevelId).toBe('lvl-1');
    expect(invalidate).toHaveBeenCalledWith(CacheDependency.pricing('loc-1'));
  });

  it('stores null for the default level', async () => {
    const { service, tx } = setup({ level: { id: 'lvl-d', isDefault: true } });
    await service.update('loc-1', 'staff-1', { priceLevelId: 'lvl-d' }, ACTOR);

    expect(tx.staff.update.mock.calls[0][0].data.priceLevelId).toBeNull();
  });

  it('rejects a level of another location', async () => {
    const { service, tx } = setup({ level: null });
    await expect(
      service.update('loc-1', 'staff-1', { priceLevelId: 'foreign' }, ACTOR),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      errorCode: ErrorCode.PRICE_LEVEL_NOT_FOUND.code,
    });
    expect(tx.staff.update).not.toHaveBeenCalled();
  });
});

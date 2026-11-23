import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { PriceLevelsService } from './price-levels.service.js';

const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'level-1',
  locationId: 'location',
  name: 'Top',
  sortOrder: 0,
  isDefault: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...over,
});

const uniqueViolation = () => ({
  code: 'P2002',
  meta: { target: ['locationId', 'name'] },
});
const defaultViolation = () => ({
  code: 'P2002',
  meta: { target: ['locationId'] },
});

describe('PriceLevelsService', () => {
  const events = { emit: vi.fn() };
  const cache = { invalidate: vi.fn() };
  const levels = { listLevels: vi.fn(), findLevel: vi.fn() };
  const staff = {
    countByPriceLevel: vi.fn(),
    resetPriceLevel: vi.fn(),
  };
  const tx = {
    $executeRaw: vi.fn(),
    priceLevel: {
      count: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    serviceLevelPrice: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const db = {
    $transaction: vi.fn(),
  };
  const service = new PriceLevelsService(
    db as never,
    levels as never,
    staff as never,
    cache as never,
    events as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((operation) => operation(tx));
    staff.countByPriceLevel.mockResolvedValue(new Map());
  });

  describe('list', () => {
    it('counts staff without a level for the default level', async () => {
      levels.listLevels.mockResolvedValue([
        row({ id: 'std', isDefault: true }),
        row({ id: 'top' }),
      ]);
      staff.countByPriceLevel.mockResolvedValue(
        new Map<string | null, number>([
          [null, 2],
          ['top', 1],
        ]),
      );
      const result = await service.list('location');
      expect(result.map(({ id, staffCount }) => [id, staffCount])).toEqual([
        ['std', 2],
        ['top', 1],
      ]);
    });
  });

  describe('create', () => {
    it('makes the first level of the location the default one', async () => {
      tx.priceLevel.count.mockResolvedValue(0);
      tx.priceLevel.create.mockResolvedValue(row({ isDefault: true }));
      const level = await service.create('location', { name: 'Top' }, actor);
      expect(tx.priceLevel.create).toHaveBeenCalledWith({
        data: {
          locationId: 'location',
          name: 'Top',
          sortOrder: 0,
          isDefault: true,
        },
      });
      expect(level.isDefault).toBe(true);
      expect(cache.invalidate).toHaveBeenCalledWith(
        expect.stringContaining('location'),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          entityType: 'PRICE_LEVEL',
          eventType: 'PRICE_LEVEL_CREATED',
          payload: { name: 'Top', isDefault: true },
        }),
      );
    });

    it('creates later levels as non-default', async () => {
      tx.priceLevel.count.mockResolvedValue(1);
      tx.priceLevel.create.mockResolvedValue(row());
      await service.create('location', { name: 'Top', sortOrder: 2 }, actor);
      expect(tx.priceLevel.create).toHaveBeenCalledWith({
        data: {
          locationId: 'location',
          name: 'Top',
          sortOrder: 2,
          isDefault: false,
        },
      });
    });

    it('locks the location before counting, so two first levels cannot both be default', async () => {
      tx.priceLevel.count.mockResolvedValue(0);
      tx.priceLevel.create.mockResolvedValue(row({ isDefault: true }));
      await service.create('location', { name: 'Top' }, actor);
      expect(tx.$executeRaw).toHaveBeenCalledOnce();
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.priceLevel.count.mock.invocationCallOrder[0],
      );
    });

    it('does not read the one-default index as a taken name', async () => {
      tx.priceLevel.count.mockResolvedValue(0);
      const violation = defaultViolation();
      tx.priceLevel.create.mockRejectedValue(violation);
      await expect(
        service.create('location', { name: 'Top' }, actor),
      ).rejects.toBe(violation);
    });

    it('reads a driver adapter violation of the name index as a taken name', async () => {
      tx.priceLevel.count.mockResolvedValue(1);
      tx.priceLevel.create.mockRejectedValue({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: { constraint: { fields: ['locationId', 'name'] } },
          },
        },
      });
      await expect(
        service.create('location', { name: 'Top' }, actor),
      ).rejects.toMatchObject({ errorCode: 'PRICE_LEVEL_NAME_EXISTS' });
    });

    it('rejects a name that is taken', async () => {
      tx.priceLevel.count.mockResolvedValue(1);
      tx.priceLevel.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create('location', { name: 'Top' }, actor),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_LEVEL_NAME_EXISTS',
        status: HttpStatus.CONFLICT,
      });
      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('moves the default flag, drops the prices of the new default and its staff level', async () => {
      const before = row({ id: 'top' });
      levels.findLevel.mockResolvedValue(before);
      tx.priceLevel.update.mockResolvedValue({ ...before, isDefault: true });
      const result = await service.update(
        'location',
        'top',
        { isDefault: true },
        actor,
      );
      expect(tx.priceLevel.updateMany).toHaveBeenCalledWith({
        where: { locationId: 'location', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.serviceLevelPrice.deleteMany).toHaveBeenCalledWith({
        where: { priceLevelId: 'top' },
      });
      expect(staff.resetPriceLevel).toHaveBeenCalledWith('top', tx);
      const order = [tx.priceLevel.updateMany, tx.priceLevel.update].map(
        (fn) => fn.mock.invocationCallOrder[0],
      );
      expect(order[0]).toBeLessThan(order[1]);
      expect(result.isDefault).toBe(true);
      expect(cache.invalidate).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          eventType: 'PRICE_LEVEL_UPDATED',
          payload: {
            changes: [{ field: 'isDefault', from: 'false', to: 'true' }],
          },
        }),
      );
    });

    it('leaves prices alone when the level is already the default one', async () => {
      const before = row({ isDefault: true });
      levels.findLevel.mockResolvedValue(before);
      tx.priceLevel.update.mockResolvedValue({ ...before, name: 'Base' });
      await service.update(
        'location',
        'level-1',
        { isDefault: true, name: 'Base' },
        actor,
      );
      expect(tx.priceLevel.updateMany).not.toHaveBeenCalled();
      expect(tx.serviceLevelPrice.deleteMany).not.toHaveBeenCalled();
      expect(staff.resetPriceLevel).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          payload: {
            changes: [{ field: 'name', from: 'Top', to: 'Base' }],
          },
        }),
      );
    });

    it('does not write an audit event for an empty change', async () => {
      const before = row();
      levels.findLevel.mockResolvedValue(before);
      tx.priceLevel.update.mockResolvedValue(before);
      await service.update('location', 'level-1', { name: 'Top' }, actor);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('answers 404 for a level of another location', async () => {
      levels.findLevel.mockRejectedValue(
        Object.assign(new Error('missing'), { status: 404 }),
      );
      await expect(
        service.update('location', 'foreign', { name: 'X' }, actor),
      ).rejects.toThrow('missing');
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a name that is taken', async () => {
      levels.findLevel.mockResolvedValue(row());
      tx.priceLevel.update.mockRejectedValue(uniqueViolation());
      await expect(
        service.update('location', 'level-1', { name: 'Std' }, actor),
      ).rejects.toMatchObject({ errorCode: 'PRICE_LEVEL_NAME_EXISTS' });
    });
  });

  describe('delete', () => {
    it('deletes a non-default level', async () => {
      tx.priceLevel.findFirst.mockResolvedValue(row());
      await service.delete('location', 'level-1', actor);
      expect(tx.priceLevel.delete).toHaveBeenCalledWith({
        where: { id: 'level-1' },
      });
      expect(cache.invalidate).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          eventType: 'PRICE_LEVEL_DELETED',
          payload: { name: 'Top' },
        }),
      );
    });

    it('keeps the default level while other levels exist', async () => {
      tx.priceLevel.findFirst.mockResolvedValue(row({ isDefault: true }));
      tx.priceLevel.count.mockResolvedValue(2);
      await expect(
        service.delete('location', 'level-1', actor),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_LEVEL_DEFAULT_IN_USE',
        status: HttpStatus.CONFLICT,
      });
      expect(tx.priceLevel.delete).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it('deletes the default level when it is the only one', async () => {
      tx.priceLevel.findFirst.mockResolvedValue(row({ isDefault: true }));
      tx.priceLevel.count.mockResolvedValue(0);
      await service.delete('location', 'level-1', actor);
      expect(tx.priceLevel.delete).toHaveBeenCalled();
    });

    it('locks the location, then checks and deletes in one transaction', async () => {
      tx.priceLevel.findFirst.mockResolvedValue(row({ isDefault: true }));
      tx.priceLevel.count.mockResolvedValue(0);
      await service.delete('location', 'level-1', actor);
      expect(db.$transaction).toHaveBeenCalledOnce();
      const order = [
        tx.$executeRaw,
        tx.priceLevel.count,
        tx.priceLevel.delete,
      ].map((fn) => fn.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((x, y) => x - y));
    });

    it('answers 404 for a level of another location', async () => {
      tx.priceLevel.findFirst.mockResolvedValue(null);
      await expect(
        service.delete('location', 'foreign', actor),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_LEVEL_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
      expect(tx.priceLevel.delete).not.toHaveBeenCalled();
    });
  });

  describe('setServiceLevelPrices', () => {
    it('upserts prices, deletes the null ones and returns the previous prices', async () => {
      tx.priceLevel.findMany.mockResolvedValue([
        row({ id: 'top', name: 'Top' }),
        row({ id: 'mid', name: 'Mid' }),
      ]);
      tx.serviceLevelPrice.findMany.mockResolvedValue([
        {
          serviceId: 'cut',
          priceLevelId: 'mid',
          price: new Prisma.Decimal('40'),
        },
      ]);
      const result = await service.setServiceLevelPrices(
        'location',
        'cut',
        [
          { levelId: 'top', price: '80.00' },
          { levelId: 'mid', price: null },
        ],
        tx as never,
      );
      expect(tx.serviceLevelPrice.upsert).toHaveBeenCalledWith({
        where: {
          serviceId_priceLevelId: { serviceId: 'cut', priceLevelId: 'top' },
        },
        create: { serviceId: 'cut', priceLevelId: 'top', price: '80.00' },
        update: { price: '80.00' },
      });
      expect(tx.serviceLevelPrice.deleteMany).toHaveBeenCalledWith({
        where: { serviceId: 'cut', priceLevelId: 'mid' },
      });
      expect(result.before.get('mid')?.toFixed(2)).toBe('40.00');
      expect(result.names.get('top')).toBe('Top');
    });

    it('rejects a price for the default level', async () => {
      tx.priceLevel.findMany.mockResolvedValue([
        row({ id: 'std', isDefault: true }),
      ]);
      await expect(
        service.setServiceLevelPrices(
          'location',
          'cut',
          [{ levelId: 'std', price: '10.00' }],
          tx as never,
        ),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_LEVEL_DEFAULT_PRICE',
        status: HttpStatus.BAD_REQUEST,
      });
      expect(tx.serviceLevelPrice.upsert).not.toHaveBeenCalled();
    });

    it('rejects a level of another location', async () => {
      tx.priceLevel.findMany.mockResolvedValue([]);
      await expect(
        service.setServiceLevelPrices(
          'location',
          'cut',
          [{ levelId: 'foreign', price: '10.00' }],
          tx as never,
        ),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_LEVEL_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});

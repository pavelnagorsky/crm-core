import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { PriceLevelFillMode } from '../enums/price-level-fill-mode.enum.js';
import { levelFillPrice } from '../rules/price-level-fill.rules.js';
import { PriceLevelFillService } from './price-level-fill.service.js';

const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };
const d = (value: string) => new Prisma.Decimal(value);
const svc = (id: string, price: string, over = {}) => ({
  id,
  title: `S ${id}`,
  price: d(price),
  categoryId: 'hair',
  sortOrder: 0,
  status: 'ACTIVE',
  ...over,
});

describe('levelFillPrice', () => {
  const spec = (mode: PriceLevelFillMode, value: number, step = 1) => ({
    mode,
    value,
    step,
  });

  it('adds a signed percent, half up, then rounds to the nearest step', () => {
    expect(levelFillPrice(4990, spec(PriceLevelFillMode.PERCENT, 1500))).toEqual(
      { price: 5739, invalid: false },
    );
    expect(
      levelFillPrice(4990, spec(PriceLevelFillMode.PERCENT, 1500, 500)),
    ).toEqual({ price: 5500, invalid: false });
    expect(
      levelFillPrice(10000, spec(PriceLevelFillMode.PERCENT, -2000)),
    ).toEqual({ price: 8000, invalid: false });
  });

  it('adds a signed amount', () => {
    expect(levelFillPrice(5000, spec(PriceLevelFillMode.AMOUNT, -1000))).toEqual(
      { price: 4000, invalid: false },
    );
  });

  it('marks a price that is zero or below, also after rounding, as invalid', () => {
    expect(
      levelFillPrice(1000, spec(PriceLevelFillMode.AMOUNT, -1000)).invalid,
    ).toBe(true);
    expect(
      levelFillPrice(1000, spec(PriceLevelFillMode.AMOUNT, -5000)).invalid,
    ).toBe(true);
    expect(
      levelFillPrice(1000, spec(PriceLevelFillMode.AMOUNT, -700, 1000)).invalid,
    ).toBe(true);
  });

  it('clears the price for BASE', () => {
    expect(levelFillPrice(1000, spec(PriceLevelFillMode.BASE, 0))).toEqual({
      price: null,
      invalid: false,
    });
  });
});

describe('PriceLevelFillService', () => {
  const events = { emit: vi.fn() };
  const cache = { invalidate: vi.fn() };
  const levels = { findLevel: vi.fn(), listLevelPricesOfLevel: vi.fn() };
  const levelsWrite = { writeLevelPrices: vi.fn() };
  const serviceCatalog = { loadCatalogSnapshot: vi.fn() };
  const tx = {};
  const db = { $transaction: vi.fn() };
  const service = new PriceLevelFillService(
    db as never,
    levels as never,
    levelsWrite as never,
    serviceCatalog as never,
    cache as never,
    events as never,
  );
  const fill = {
    categoryIds: [] as string[],
    mode: PriceLevelFillMode.PERCENT,
    value: '10.00',
    priceRoundingStep: '1.00',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((operation) => operation(tx));
    levels.findLevel.mockResolvedValue({
      id: 'top',
      name: 'Top',
      isDefault: false,
    });
    levels.listLevelPricesOfLevel.mockResolvedValue([
      { serviceId: 'color', priceLevelId: 'top', price: d('99.00') },
    ]);
    serviceCatalog.loadCatalogSnapshot.mockResolvedValue({
      categories: [
        { id: 'hair', name: 'Hair' },
        { id: 'nails', name: 'Nails' },
      ],
      services: [
        svc('cut', '60.00'),
        svc('color', '90.00'),
        svc('nail', '30.00', { categoryId: 'nails' }),
        svc('gone', '10.00', { status: 'ARCHIVED' }),
      ],
    });
  });

  describe('preview', () => {
    it('lists active services with the new price and preselects those without a level price', async () => {
      const items = await service.preview('location', 'top', fill);
      expect(
        items.map((i) => [
          i.serviceId,
          i.categoryName,
          i.currentPrice?.toFixed(2) ?? null,
          i.newPrice?.toFixed(2),
          i.checked,
          i.invalid,
        ]),
      ).toEqual([
        ['color', 'Hair', '99.00', '99.00', false, false],
        ['cut', 'Hair', null, '66.00', true, false],
        ['nail', 'Nails', null, '33.00', true, false],
      ]);
    });

    it('filters by category', async () => {
      const items = await service.preview('location', 'top', {
        ...fill,
        categoryIds: ['nails'],
      });
      expect(items.map((i) => i.serviceId)).toEqual(['nail']);
    });

    it('returns null prices for BASE', async () => {
      const items = await service.preview('location', 'top', {
        ...fill,
        mode: PriceLevelFillMode.BASE,
        value: undefined,
      });
      expect(items.every((i) => i.newPrice === null)).toBe(true);
    });

    it('refuses the default level and values out of range', async () => {
      levels.findLevel.mockResolvedValueOnce({ id: 'std', isDefault: true });
      await expect(
        service.preview('location', 'std', fill),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_LEVEL_DEFAULT_PRICE',
        status: HttpStatus.BAD_REQUEST,
      });
      await expect(
        service.preview('location', 'top', { ...fill, value: '-99.01' }),
      ).rejects.toBeDefined();
      await expect(
        service.preview('location', 'top', { ...fill, value: '1000.01' }),
      ).rejects.toBeDefined();
    });
  });

  describe('apply', () => {
    it('writes the recomputed prices in one transaction, drops the cache and audits', async () => {
      const updated = await service.apply(
        'location',
        'top',
        { ...fill, serviceIds: ['cut', 'nail'] },
        actor,
      );
      expect(updated).toBe(2);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(levelsWrite.writeLevelPrices).toHaveBeenCalledWith(
        'top',
        [
          { serviceId: 'cut', price: d('66.00') },
          { serviceId: 'nail', price: d('33.00') },
        ],
        tx,
      );
      expect(cache.invalidate).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          eventType: AuditEvent.LEVEL_PRICES_FILLED,
          entityId: 'top',
          payload: { name: 'Top', updated: 2 },
        }),
      );
    });

    it('does not count or write a price that stays the same', async () => {
      const updated = await service.apply(
        'location',
        'top',
        { ...fill, serviceIds: ['color'] },
        actor,
      );
      expect(updated).toBe(0);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('clears prices for BASE', async () => {
      await service.apply(
        'location',
        'top',
        {
          ...fill,
          mode: PriceLevelFillMode.BASE,
          value: undefined,
          serviceIds: ['color', 'cut'],
        },
        actor,
      );
      expect(levelsWrite.writeLevelPrices).toHaveBeenCalledWith(
        'top',
        [{ serviceId: 'color', price: null }],
        tx,
      );
    });

    it('refuses an invalid selected row with PRICE_LEVEL_FILL_INVALID', async () => {
      await expect(
        service.apply(
          'location',
          'top',
          {
            ...fill,
            mode: PriceLevelFillMode.AMOUNT,
            value: '-30.00',
            serviceIds: ['nail'],
          },
          actor,
        ),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_LEVEL_FILL_INVALID',
        status: HttpStatus.BAD_REQUEST,
      });
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('ignores invalid rows that are not selected, and rejects unknown services', async () => {
      await service.apply(
        'location',
        'top',
        {
          ...fill,
          mode: PriceLevelFillMode.AMOUNT,
          value: '-30.00',
          serviceIds: ['cut'],
        },
        actor,
      );
      expect(levelsWrite.writeLevelPrices).toHaveBeenCalled();
      await expect(
        service.apply('location', 'top', { ...fill, serviceIds: ['gone'] }, actor),
      ).rejects.toBeDefined();
    });

    it('refuses the default level', async () => {
      levels.findLevel.mockResolvedValueOnce({ id: 'std', isDefault: true });
      await expect(
        service.apply('location', 'std', { ...fill, serviceIds: ['cut'] }, actor),
      ).rejects.toMatchObject({ errorCode: 'PRICE_LEVEL_DEFAULT_PRICE' });
    });
  });
});

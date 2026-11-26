import { Prisma, PriceChangeSkip, PriceChangeTarget } from '@prisma/client';
import { PriceChangeStore } from './price-change-store.service.js';

const item = (id: string, over: object) => ({
  id,
  targetType: PriceChangeTarget.LEVEL,
  serviceId: 's1',
  priceLevelId: null,
  staffId: null,
  bundleId: null,
  productLocationId: null,
  ...over,
});

const product = (id: string, productLocationId: string | null) =>
  item(id, {
    targetType: PriceChangeTarget.PRODUCT,
    serviceId: null,
    productLocationId,
  });

const ref = (productLocationId: string, retailPrice: string | null, isForSale = true) => ({
  productLocationId,
  productId: `p-${productLocationId}`,
  name: 'Шампунь',
  sku: null,
  categoryName: null,
  retailPrice: retailPrice === null ? null : new Prisma.Decimal(retailPrice),
  isForSale,
});

function emptyServiceTx() {
  return {
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 0),
    priceLevel: { findMany: vi.fn(async () => []) },
  };
}

describe('PriceChangeStore.loadStates', () => {
  it('skips a level row whose level became the default', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { serviceId: 's1', priceLevelId: 'vip', price: new Prisma.Decimal('50.00') },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const tx = {
      $queryRaw: queryRaw,
      priceLevel: { findMany: vi.fn(async () => [{ id: 'old-vip' }]) },
    };
    const products = { lockLocationRefs: vi.fn(async () => []) };
    const states = await new PriceChangeStore(products as never).loadStates(
      tx as never,
      [
        item('i1', { priceLevelId: 'vip' }),
        item('i2', { priceLevelId: 'old-vip' }),
      ] as never,
    );
    expect(states.get('i1')).toEqual({ skip: null, current: 5000 });
    expect(states.get('i2')).toEqual({
      skip: PriceChangeSkip.LEVEL_IS_DEFAULT,
      current: null,
    });
  });

  it('reads product rows through ProductsService: price, not for sale, deleted', async () => {
    const products = {
      lockLocationRefs: vi.fn(async () => [
        ref('pl-1', '55.00'),
        ref('pl-2', null),
        ref('pl-3', '10.00', false),
      ]),
    };
    const tx = emptyServiceTx();
    const states = await new PriceChangeStore(products as never).loadStates(
      tx as never,
      [
        product('i1', 'pl-1'),
        product('i2', 'pl-2'),
        product('i3', 'pl-3'),
        product('i4', null),
        product('i5', 'pl-gone'),
      ] as never,
    );
    expect(products.lockLocationRefs).toHaveBeenCalledWith(tx, [
      'pl-1',
      'pl-2',
      'pl-3',
      'pl-gone',
    ]);
    expect(states.get('i1')).toEqual({ skip: null, current: 5500 });
    expect(states.get('i2')).toEqual({ skip: PriceChangeSkip.NOT_FOR_SALE, current: null });
    expect(states.get('i3')).toEqual({ skip: PriceChangeSkip.NOT_FOR_SALE, current: null });
    expect(states.get('i4')).toEqual({ skip: PriceChangeSkip.TARGET_DELETED, current: null });
    expect(states.get('i5')).toEqual({ skip: PriceChangeSkip.TARGET_DELETED, current: null });
  });
});

describe('PriceChangeStore.writePrices', () => {
  it('writes product retail prices through ProductsService', async () => {
    const products = { setRetailPrices: vi.fn(async () => undefined) };
    const tx = emptyServiceTx();
    const items = new Map([
      ['i1', product('i1', 'pl-1')],
      ['i2', item('i2', { targetType: PriceChangeTarget.BASE })],
    ]);
    await new PriceChangeStore(products as never).writePrices(
      tx as never,
      items as never,
      [
        { itemId: 'i1', price: 6050 },
        { itemId: 'i2', price: 1000 },
      ],
    );
    expect(products.setRetailPrices).toHaveBeenCalledWith(tx, [
      { productLocationId: 'pl-1', retailPrice: new Prisma.Decimal('60.5') },
    ]);
  });
});

import {
  Prisma,
  PriceChangeCatalog,
  PriceChangeSource,
  PriceChangeTarget,
} from '@prisma/client';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';
import { rejectedAppException } from '../testing/rejected-app-exception.js';
import { ProductPriceChangesService } from './product-price-changes.service.js';

const ACTOR = { id: 'user-1', name: 'Анна', role: 'OWNER' } as never;

const row = (productId: string, before: number, after: number) => ({
  key: `PRODUCT:${productId}`,
  productId,
  productLocationId: `pl-${productId}`,
  title: `Товар ${productId}`,
  before,
  after,
  invalid: false,
  checked: before !== after,
});

const dto = {
  allProducts: true,
  productIds: [],
  categoryIds: [],
  mode: PriceChangeMode.PERCENT,
  value: '10.00',
  priceRoundingStep: '1.00',
  effectiveDate: '2027-01-01',
  selectedKeys: ['PRODUCT:a', 'PRODUCT:b'],
  overrides: [{ key: 'PRODUCT:b', price: '99.00' }],
};

function setup(written: object | null) {
  const tx = {};
  const db = {
    $transaction: vi.fn(async (run: (client: object) => Promise<unknown>) => run(tx)),
  };
  const previews = {
    compute: vi.fn(async () => ({
      rows: [row('a', 5500, 6100), row('b', 1000, 1100), row('c', 2000, 2200)],
    })),
  };
  const writer = {
    write: vi.fn(async () => written),
    afterCommit: vi.fn(async () => undefined),
  };
  const reads = { findDetail: vi.fn(async () => 'detail') };
  const service = new ProductPriceChangesService(
    db as never,
    { lock: vi.fn(async () => undefined) } as never,
    { applyDue: vi.fn(async () => undefined) } as never,
    previews as never,
    writer as never,
    {} as never,
    reads as never,
  );
  return { service, writer, reads, previews };
}

describe('ProductPriceChangesService.create', () => {
  it('stores the selected product rows with the manual prices as a PRODUCTS change', async () => {
    const result = { changeId: 'ch1', applied: false, dueApplied: [] };
    const { service, writer, reads, previews } = setup(result);
    await expect(service.create('loc', dto, ACTOR)).resolves.toBe('detail');
    expect(previews.compute.mock.calls[0]).toEqual(
      expect.arrayContaining(['loc', false]),
    );
    const input = (writer.write.mock.calls[0] as unknown[])[1] as {
      catalog: PriceChangeCatalog;
      source: PriceChangeSource;
      ruleSpec: unknown;
      items: { productLocationId: string; targetType: PriceChangeTarget; beforePrice: Prisma.Decimal; afterPrice: Prisma.Decimal }[];
      productIds: Map<string, string>;
    };
    expect(input.catalog).toBe(PriceChangeCatalog.PRODUCTS);
    expect(input.source).toBe(PriceChangeSource.RULE);
    expect(input.ruleSpec).toEqual({
      mode: PriceChangeMode.PERCENT,
      value: '10.00',
      priceRoundingStep: '1.00',
    });
    expect(
      input.items.map((item) => [
        item.targetType,
        item.productLocationId,
        item.beforePrice.toFixed(2),
        item.afterPrice.toFixed(2),
      ]),
    ).toEqual([
      [PriceChangeTarget.PRODUCT, 'pl-a', '55.00', '61.00'],
      [PriceChangeTarget.PRODUCT, 'pl-b', '10.00', '99.00'],
    ]);
    expect(input.productIds.get('pl-c')).toBe('c');
    expect(writer.afterCommit).toHaveBeenCalledWith('loc', result, ACTOR);
    expect(reads.findDetail).toHaveBeenCalledWith('loc', 'ch1');
  });

  it('400 PRICE_CHANGE_EMPTY when the writer keeps nothing', async () => {
    const { service } = setup(null);
    const error = await rejectedAppException(service.create('loc', dto, ACTOR));
    expect(error.errorCode).toBe('PRICE_CHANGE_EMPTY');
  });
});

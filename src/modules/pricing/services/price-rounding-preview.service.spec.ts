import { PriceScheduleType } from '@prisma/client';
import {
  pricingSnapshot,
  surchargeRule,
} from '../engine/testing/pricing-snapshot.factory.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { PriceRoundingPreviewService } from './price-rounding-preview.service.js';

const NOW = new Date('2026-11-23T10:00:00.000Z');

const catalogOf = (titles: Record<string, string>) => ({
  services: Object.entries(titles).map(([id, title]) => ({
    id,
    title,
    categoryId: null,
    status: 'ACTIVE',
  })),
});

describe('PriceRoundingPreviewService', () => {
  const snapshots = { load: vi.fn() };
  const serviceCatalog = { loadCatalogSnapshot: vi.fn() };
  const locations = { getBookingSettings: vi.fn() };
  const service = new PriceRoundingPreviewService(
    snapshots as never,
    serviceCatalog as never,
    locations as never,
  );

  const setup = (
    prices: Record<string, number>,
    snapshot: Partial<PricingSnapshot> = {},
  ) => {
    snapshots.load.mockResolvedValue({
      ...pricingSnapshot({ services: prices, bundles: [] }),
      ...snapshot,
    });
    serviceCatalog.loadCatalogSnapshot.mockResolvedValue(
      catalogOf(
        Object.fromEntries(Object.keys(prices).map((id) => [id, `S ${id}`])),
      ),
    );
  };

  beforeEach(() => {
    vi.resetAllMocks();
    locations.getBookingSettings.mockResolvedValue({ timezone: 'UTC' });
  });

  it('uses a sample +15% when no surcharge reaches the service, and adds a -15% row rounded down', async () => {
    setup({ cut: 6000 });
    const rows = await service.preview('location', '1.00', NOW);
    expect(rows).toEqual([
      {
        serviceTitle: 'S cut',
        basePrice: 6000,
        label: 'наценка +15%',
        raw: 6900,
        rounded: 6900,
        largeStep: false,
      },
      {
        serviceTitle: 'S cut',
        basePrice: 6000,
        label: 'акция −15%',
        raw: 5100,
        rounded: 5100,
        largeStep: false,
      },
    ]);
  });

  it('rounds a surcharge to the nearest step and a promotion down', async () => {
    setup({ cut: 4990 });
    const [surcharge, promotion] = await service.preview(
      'location',
      '5.00',
      NOW,
    );
    // 49.90 + 15% = 57.39 -> 55.00; 49.90 - 15% = 42.41 -> 40.00.
    expect(surcharge).toMatchObject({ raw: 5739, rounded: 5500 });
    expect(promotion).toMatchObject({ raw: 4241, rounded: 4000 });
  });

  it('labels a row with the percent surcharge that reaches the service', async () => {
    setup(
      { cut: 6000, color: 9000 },
      {
        rules: [
          surchargeRule('amount', { valueType: 'AMOUNT' as never, value: 500 }),
          surchargeRule('off', { enabled: false, value: 5000 }),
          surchargeRule('only-color', {
            value: 2000,
            appliesToAll: false,
            targets: [{ type: 'SERVICE' as never, id: 'color', excluded: false }],
          }),
        ],
      },
    );
    const rows = await service.preview('location', '1.00', NOW);
    expect(rows.map((row) => [row.serviceTitle, row.label])).toEqual([
      ['S cut', 'наценка +15%'],
      ['S color', 'наценка +20%'],
      ['S cut', 'акция −15%'],
    ]);
  });

  it('skips a surcharge that has ended', async () => {
    setup(
      { cut: 6000 },
      {
        rules: [
          surchargeRule('ended', {
            scheduleType: PriceScheduleType.WEEKLY as never,
            visitFrom: '2026-01-01',
            visitTo: '2026-02-01',
            value: 2000,
          }),
        ],
      },
    );
    const [row] = await service.preview('location', '1.00', NOW);
    expect(row.label).toBe('наценка +15%');
  });

  it('shows up to 4 services with distinct prices spread from cheap to expensive', async () => {
    setup({
      a: 1000,
      b: 1000,
      c: 2000,
      d: 3000,
      e: 4000,
      f: 5000,
      g: 6000,
      h: 7000,
    });
    const rows = await service.preview('location', '1.00', NOW);
    expect(rows.map((row) => row.basePrice)).toEqual([
      1000, 3000, 5000, 7000, 1000,
    ]);
  });

  it('flags a rounding that moves the price by more than 5%', async () => {
    setup({ cheap: 100, dear: 100_00 });
    const rows = await service.preview('location', '10.00', NOW);
    // 1.00 + 15% = 1.15 -> 0.00 (never below zero) is a large move; 100.00 + 15% = 115.00 -> 120.00 is not... 4.3%.
    expect(rows[0]).toMatchObject({ raw: 115, rounded: 0, largeStep: true });
    expect(rows[1]).toMatchObject({
      raw: 11500,
      rounded: 12000,
      largeStep: false,
    });
  });

  it('has nothing to show without priced services', async () => {
    setup({});
    expect(await service.preview('location', '1.00', NOW)).toEqual([]);
  });
});

import {
  BundlePricingMode,
  PriceRuleTargetType,
  PriceValueType,
  Prisma,
  PromotionClientFilter,
} from '@prisma/client';
import { PublicPromotionView } from '../../pricing/interfaces/public-promotion-view.interface.js';
import { bookingSetupPromotionLabels } from './booking-setup-promotions.rules.js';

const { SERVICE, SERVICE_CATEGORY, BUNDLE } = PriceRuleTargetType;

const promotion = (
  id: string,
  overrides: Partial<PublicPromotionView> = {},
): PublicPromotionView => ({
  id,
  publicName: `Акция ${id}`,
  publicDescription: null,
  valueType: PriceValueType.PERCENT,
  value: new Prisma.Decimal('10.00'),
  clientFilter: PromotionClientFilter.ANY,
  requiresCode: false,
  conditions: [],
  appliesToAll: true,
  targets: [],
  ...overrides,
});

/** Cut and color in "hair", wash without a category; a SUM and a FIXED bundle of cut + wash. */
const catalog = {
  services: [
    { id: 'cut', categoryId: 'hair' },
    { id: 'color', categoryId: 'hair' },
    { id: 'wash', categoryId: null },
  ],
  bundles: [
    {
      id: 'sum',
      pricingMode: BundlePricingMode.SUM,
      items: [{ serviceId: 'cut' }, { serviceId: 'wash' }],
    },
    {
      id: 'fixed',
      pricingMode: BundlePricingMode.FIXED,
      items: [{ serviceId: 'cut' }, { serviceId: 'wash' }],
    },
  ],
} as never;

const from = (value: string) => ({ priceFrom: new Prisma.Decimal(value) });
const prices = {
  services: new Map([
    ['cut', from('50')],
    ['color', from('90')],
    ['wash', from('15')],
  ]),
  bundles: new Map([
    ['sum', from('65')],
    ['fixed', from('60')],
  ]),
};

const labels = (promotions: PublicPromotionView[]) =>
  bookingSetupPromotionLabels(promotions, catalog, prices);

describe('bookingSetupPromotionLabels (docs/pricing-stage4-api.md)', () => {
  it('no promotions: no labels', () => {
    const result = labels([]);
    expect([...result.services.values()]).toEqual([null, null, null]);
    expect([...result.bundles.values()]).toEqual([null, null]);
  });

  it('one promotion: its public name', () => {
    const result = labels([promotion('ten')]);
    expect(result.services.get('cut')).toEqual({
      label: 'Акция ten',
      promotionIds: ['ten'],
    });
    expect(result.bundles.get('fixed')?.label).toBe('Акция ten');
  });

  it('several: "Скидки до N%" with the biggest percent, an amount as its percent of "from"', () => {
    const result = labels([
      promotion('ten'),
      promotion('fifteen-byn', {
        valueType: PriceValueType.AMOUNT,
        value: new Prisma.Decimal('15.00'),
      }),
    ]);
    // 15 of 50 = 30%; 15 of 90 = 16.67% -> 16; 15 of 15 = 100%.
    expect(result.services.get('cut')?.label).toBe('Скидки до 30%');
    expect(result.services.get('color')?.label).toBe('Скидки до 16%');
    expect(result.services.get('wash')).toEqual({
      label: 'Скидки до 100%',
      promotionIds: ['ten', 'fifteen-byn'],
    });
  });

  it('targets: service, category, exclusions', () => {
    const result = labels([
      promotion('hair', {
        appliesToAll: false,
        targets: [{ type: SERVICE_CATEGORY, id: 'hair', excluded: false }],
      }),
      promotion('not-color', {
        targets: [{ type: SERVICE, id: 'color', excluded: true }],
      }),
    ]);
    expect(result.services.get('cut')?.promotionIds).toEqual([
      'hair',
      'not-color',
    ]);
    expect(result.services.get('color')?.promotionIds).toEqual(['hair']);
    expect(result.services.get('wash')?.promotionIds).toEqual(['not-color']);
  });

  it('a FIXED bundle is reached only as a bundle, a SUM bundle also by its services', () => {
    const byService = promotion('cut-only', {
      appliesToAll: false,
      targets: [{ type: SERVICE, id: 'cut', excluded: false }],
    });
    const byBundle = promotion('fixed-only', {
      appliesToAll: false,
      targets: [{ type: BUNDLE, id: 'fixed', excluded: false }],
    });
    const result = labels([byService, byBundle]);
    expect(result.bundles.get('sum')?.promotionIds).toEqual(['cut-only']);
    expect(result.bundles.get('fixed')?.promotionIds).toEqual(['fixed-only']);
  });

  it('an excluded bundle gets no label', () => {
    const result = labels([
      promotion('all', {
        targets: [{ type: BUNDLE, id: 'sum', excluded: true }],
      }),
    ]);
    expect(result.bundles.get('sum')).toBeNull();
    expect(result.bundles.get('fixed')?.promotionIds).toEqual(['all']);
  });
});

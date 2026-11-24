import {
  PriceRuleKind,
  PriceRuleTargetType,
  PromotionChannel,
} from '@prisma/client';
import { priceRuleRecord } from '../testing/price-rule-record.factory.js';
import { PromotionPublicService } from './promotion-public.service.js';

// Monday 23 November 2026; the online window ends on 6 December.
const TODAY = '2026-11-23';
const WINDOW_END = '2026-12-06';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const promotion = (
  id: string,
  over: Parameters<typeof priceRuleRecord>[0] = {},
) =>
  priceRuleRecord({
    id,
    name: `Internal ${id}`,
    kind: PriceRuleKind.PROMOTION,
    value: '15.00',
    ...over,
    promotion: { publicName: `Акция ${id}`, ...over.promotion },
  });

describe('PromotionPublicService', () => {
  const reads = { listLivePromotions: vi.fn() };
  const catalog = { nameTargets: vi.fn() };
  const locations = { getBookingSettings: vi.fn() };
  const staff = { namesByIds: vi.fn() };
  const service = new PromotionPublicService(
    reads as never,
    catalog as never,
    locations as never,
    staff as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    locations.getBookingSettings.mockResolvedValue({
      timezone: 'Europe/Minsk',
      currency: 'BYN',
    });
    catalog.nameTargets.mockImplementation(async (_location, targets) =>
      targets.map((target: { type: string; id: string }) => ({
        ...target,
        name: target.id === 'nails' ? 'Маникюр' : null,
      })),
    );
    staff.namesByIds.mockResolvedValue(new Map());
  });

  it('lists the promotions clients may see in the online window', async () => {
    reads.listLivePromotions.mockResolvedValue([
      promotion('shown', {
        appliesToAll: false,
        targets: [[PriceRuleTargetType.SERVICE, 'nails']],
      }),
      promotion('hidden', { promotion: { showAsPromotion: false } }),
      promotion('coded', { promotion: { promoCode: 'AUTUMN' } }),
      promotion('admin', { promotion: { channels: [PromotionChannel.ADMIN] } }),
      promotion('later', { visitFrom: '2026-12-10' }),
      promotion('soon', { visitFrom: '2026-12-01' }),
      promotion('over', { visitTo: '2026-11-20' }),
      promotion('booking-over', { promotion: { bookingTo: day('2026-11-22') } }),
      promotion('booking-later', {
        promotion: { bookingFrom: day('2026-12-07') },
      }),
    ]);
    const views = await service.listForBookingSetup('location', TODAY, WINDOW_END);
    expect(views.map((view) => view.id)).toEqual(['shown', 'soon']);
    expect(views[0]).toMatchObject({
      publicName: 'Акция shown',
      requiresCode: false,
      appliesToAll: false,
      targets: [{ type: 'SERVICE', id: 'nails', excluded: false }],
      conditions: [
        '−15% на Маникюр',
        'На услугу действует одна скидка, самая выгодная',
      ],
    });
  });

  it('finds a promotion with a code for its link without the code', async () => {
    reads.listLivePromotions.mockResolvedValue([
      promotion('coded', { promotion: { promoCode: 'AUTUMN' } }),
    ]);
    const view = await service.findPublic('location', 'coded', TODAY);
    expect(view.requiresCode).toBe(true);
    expect(JSON.stringify(view)).not.toContain('AUTUMN');
  });

  it.each([
    ['missing (archived, disabled or another location)', []],
    ['over', [promotion('p', { visitTo: '2026-11-01' })]],
  ])('answers 404 PROMOTION_NOT_FOUND when %s', async (_name, rules) => {
    reads.listLivePromotions.mockResolvedValue(rules);
    await expect(
      service.findPublic('location', 'p', TODAY),
    ).rejects.toMatchObject({ errorCode: 'PROMOTION_NOT_FOUND', status: 404 });
  });

  it('takes today in the location zone', async () => {
    // 22:30 UTC is already the next day in Minsk.
    expect(
      await service.locationToday('location', new Date('2026-11-23T22:30:00Z')),
    ).toBe('2026-11-24');
  });
});

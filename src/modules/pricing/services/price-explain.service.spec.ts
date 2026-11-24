import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { PromotionClientFilter } from '../engine/enums/promotion-client-filter.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import {
  pricingSnapshot,
  priceLevel,
  pricingStaff,
  promotionRule,
  quoteContext,
  surchargeRule,
  weekdays,
} from '../engine/testing/pricing-snapshot.factory.js';
import { PriceExplainClientType } from '../enums/price-explain-client-type.enum.js';
import { PricingFacade } from '../pricing.facade.js';
import { PriceExplainService } from './price-explain.service.js';

describe('PriceExplainService', () => {
  const snapshots = { load: vi.fn() };
  const bookings = { previewStaffing: vi.fn(), localPricingContext: vi.fn() };
  const service = new PriceExplainService(
    snapshots as never,
    new PricingFacade(snapshots as never),
    bookings as never,
  );
  // Friday 4 December 2026, 18:00.
  const base = { staffId: null, date: '2026-12-04', time: '18:00' };

  const salon = (promotions: PricingRuleEntry[] = []) =>
    pricingSnapshot({
        services: { cut: 6000, color: 9000 },
        bundles: [],
        levels: [priceLevel('std', 'Standard', true), priceLevel('top', 'Top')],
        levelPrices: { cut: { top: 8000 } },
        staff: [
          pricingStaff('anna', 'top', {}, 'Anna'),
          pricingStaff('boris', null, { cut: 5000 }, 'Boris'),
        ],
        rules: [
          surchargeRule('evening', {
            name: 'Evening',
            weekdaysMask: weekdays(5),
            intervals: [{ start: 1020, end: 1260 }],
          }),
          surchargeRule('morning', {
            name: 'Morning',
            intervals: [{ start: 480, end: 600 }],
          }),
          ...promotions,
        ],
        roundingStep: 1,
      });

  beforeEach(() => {
    vi.resetAllMocks();
    snapshots.load.mockResolvedValue(salon());
    bookings.localPricingContext.mockResolvedValue(quoteContext());
    bookings.previewStaffing.mockResolvedValue({
      qualifiedStaffIds: ['anna', 'boris'],
      freeStaffIds: ['boris'],
      assignedStaffId: 'boris',
    });
  });

  it('explains the layers of the staff member the any-staff rule assigned', async () => {
    const result = await service.explain('location', {
      ...base,
      serviceId: 'cut',
    });
    expect(bookings.previewStaffing).toHaveBeenCalledWith(
      'location',
      expect.objectContaining({
        serviceIds: ['cut'],
        bundleId: null,
        staffId: null,
        date: '2026-12-04',
        time: '18:00',
      }),
    );
    expect(result.staffId).toBe('boris');
    expect(result.staffName).toBe('Boris');
    expect(result.levelName).toBe('Standard');
    expect(result.total).toBe(5500);
    expect(result.line).toMatchObject({
      basePrice: 6000,
      staffPrice: 5000,
      listPrice: 5500,
      total: 5500,
    });
    expect(result.line.adjustments.map((a) => [a.kind, a.ruleId, a.amount])).toEqual(
      [
        ['STAFF', null, -1000],
        ['SURCHARGE', 'evening', 500],
      ],
    );
  });

  it('lists every qualified staff member with the price and availability at that time', async () => {
    const result = await service.explain('location', {
      ...base,
      serviceId: 'cut',
    });
    expect(result.candidates).toEqual([
      {
        staffId: 'anna',
        name: 'Anna',
        levelName: 'Top',
        personal: false,
        price: 8800,
        available: false,
      },
      {
        staffId: 'boris',
        name: 'Boris',
        levelName: 'Standard',
        personal: true,
        price: 5500,
        available: true,
      },
    ]);
  });

  it('names the rules that did not apply with their intervals', async () => {
    const result = await service.explain('location', {
      ...base,
      serviceId: 'cut',
    });
    expect(result.notApplied).toEqual([
      {
        ruleId: 'morning',
        kind: 'SURCHARGE',
        name: 'Morning',
        reason: 'OUT_OF_INTERVAL',
        intervals: [{ start: 480, end: 600 }],
      },
    ]);
  });

  it('prices a chosen staff member and skips the any-staff ranking', async () => {
    bookings.previewStaffing.mockResolvedValue({
      qualifiedStaffIds: ['anna', 'boris'],
      freeStaffIds: ['anna'],
      assignedStaffId: 'anna',
    });
    const result = await service.explain('location', {
      ...base,
      staffId: 'anna',
      serviceId: 'cut',
    });
    expect(bookings.previewStaffing).toHaveBeenCalledWith(
      'location',
      expect.objectContaining({ staffId: 'anna' }),
    );
    expect(result.total).toBe(8800);
  });

  it('falls back to the base price when nobody is free', async () => {
    bookings.previewStaffing.mockResolvedValue({
      qualifiedStaffIds: ['anna'],
      freeStaffIds: [],
      assignedStaffId: null,
    });
    const result = await service.explain('location', {
      ...base,
      serviceId: 'cut',
    });
    expect(result).toMatchObject({
      staffId: null,
      staffName: null,
      levelName: null,
      total: 6600,
    });
  });

  it('requires exactly one of service and bundle, and a known staff member', async () => {
    await expect(service.explain('location', base)).rejects.toBeDefined();
    await expect(
      service.explain('location', { ...base, serviceId: 'nope' }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SERVICE_NOT_FOUND' });
    await expect(
      service.explain('location', {
        ...base,
        serviceId: 'cut',
        staffId: 'ghost',
      }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_STAFF_NOT_FOUND' });
  });

  describe('promotions and the client discount (docs/pricing-stage4-api.md)', () => {
    const tenOff = promotionRule('ten', { name: 'Ten', value: 1000 });
    const newcomers = promotionRule(
      'new',
      { name: 'New', value: 2000 },
      { clientFilter: PromotionClientFilter.NEW },
    );
    const coded = promotionRule(
      'coded',
      { name: 'Coded', value: 500 },
      { promoCode: 'AUTUMN' },
    );

    it('asks bookings for the context of the request and ranks staff with it', async () => {
      await service.explain('location', {
        ...base,
        serviceId: 'cut',
        channel: PromotionChannel.ADMIN,
        clientId: 'client-1',
        promoCode: 'AUTUMN',
        bookedAt: '2026-12-01T10:00:00',
      });
      expect(bookings.localPricingContext).toHaveBeenCalledWith('location', {
        channel: PromotionChannel.ADMIN,
        visitStart: '2026-12-04T18:00:00',
        bookedAt: '2026-12-01T10:00:00',
        clientId: 'client-1',
        promoCode: 'AUTUMN',
      });
      expect(bookings.previewStaffing).toHaveBeenCalledWith(
        'location',
        expect.objectContaining({ context: quoteContext() }),
      );
    });

    it('online by default, with an unknown client', async () => {
      await service.explain('location', { ...base, serviceId: 'cut' });
      expect(bookings.localPricingContext).toHaveBeenCalledWith(
        'location',
        expect.objectContaining({
          channel: PromotionChannel.ONLINE,
          bookedAt: null,
          clientId: null,
          promoCode: null,
        }),
      );
    });

    it('shows the discount, the charged price and the discounted candidates', async () => {
      snapshots.load.mockResolvedValue(salon([tenOff]));
      const result = await service.explain('location', {
        ...base,
        serviceId: 'cut',
      });
      // Boris: 50 + 10% evening = 55, -10% = 49.50.
      expect(result.line).toMatchObject({
        listPrice: 5500,
        chargedPrice: 4950,
        total: 4950,
        discount: { kind: 'PROMOTION', ruleId: 'ten', amount: -550 },
      });
      expect(result.candidates.map((item) => [item.staffId, item.price])).toEqual([
        ['anna', 7920],
        ['boris', 4950],
      ]);
    });

    it('lists promotions that did not apply with their kind and reason', async () => {
      snapshots.load.mockResolvedValue(salon([tenOff, newcomers, coded]));
      const result = await service.explain('location', {
        ...base,
        serviceId: 'cut',
      });
      expect(
        result.notApplied.map((item) => [item.ruleId, item.kind, item.reason]),
      ).toEqual([
        ['morning', 'SURCHARGE', 'OUT_OF_INTERVAL'],
        ['coded', 'PROMOTION', 'PROMO_CODE_REQUIRED'],
        ['new', 'PROMOTION', 'CLIENT_UNKNOWN'],
      ]);
      expect(result.promoCode).toBeNull();
    });

    it('imagines a new client by clientType when no clientId is given', async () => {
      snapshots.load.mockResolvedValue(salon([tenOff, newcomers]));
      const result = await service.explain('location', {
        ...base,
        serviceId: 'cut',
        clientType: PriceExplainClientType.NEW,
      });
      expect(result.line.discount?.ruleId).toBe('new');
      expect(result.notApplied).toContainEqual(
        expect.objectContaining({ ruleId: 'ten', reason: 'LESS_BENEFICIAL' }),
      );
    });

    it('reports what the promo code did', async () => {
      snapshots.load.mockResolvedValue(salon([tenOff, coded]));
      bookings.localPricingContext.mockResolvedValue(
        quoteContext({ promoCode: 'AUTUMN' }),
      );
      const result = await service.explain('location', {
        ...base,
        serviceId: 'cut',
        promoCode: 'AUTUMN',
      });
      expect(result.promoCode).toEqual({
        code: 'AUTUMN',
        status: 'BETTER_APPLIED',
        ruleId: 'coded',
        reason: null,
        minVisitTotal: null,
      });
    });
  });
});

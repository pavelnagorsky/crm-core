import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PriceRuleTargetType } from '../engine/enums/price-rule-target-type.enum.js';
import { ProductUnit } from '../engine/enums/product-unit.enum.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { PromotionClientFilter } from '../engine/enums/promotion-client-filter.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import {
  pricingProduct,
  pricingSnapshot,
  priceLevel,
  pricingStaff,
  promotionRule,
  quoteContext,
  surchargeRule,
  weekdays,
} from '../engine/testing/pricing-snapshot.factory.js';
import { PriceExplainClientType } from '../enums/price-explain-client-type.enum.js';
import { PriceExplainProductContext } from '../enums/price-explain-product-context.enum.js';
import { PricingFacade } from '../pricing.facade.js';
import { PriceExplainService } from './price-explain.service.js';

describe('PriceExplainService', () => {
  const snapshots = { load: vi.fn() };
  const bookings = { previewStaffing: vi.fn(), localPricingContext: vi.fn() };
  const pricingContext = { build: vi.fn() };
  const locations = { getBookingSettings: vi.fn() };
  const inventory = { lastPurchaseUnitCosts: vi.fn() };
  const service = new PriceExplainService(
    snapshots as never,
    new PricingFacade(snapshots as never),
    bookings as never,
    pricingContext as never,
    locations as never,
    inventory as never,
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
        products: [
          pricingProduct('shampoo', 2000, { categoryId: 'care' }),
          pricingProduct('oil', 1500, { unit: ProductUnit.MILLILITER }),
        ],
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

  describe('products (docs/pricing-stage7-api.md, «Проверка цены»)', () => {
    const careTen = promotionRule('care', {
      name: 'Care',
      value: 1000,
      appliesToAllServices: false,
      targets: [
        {
          type: PriceRuleTargetType.PRODUCT_CATEGORY,
          id: 'care',
          excluded: false,
        },
      ],
    });
    const leadTime = promotionRule(
      'lead',
      { name: 'Lead', value: 3000, appliesToAllProducts: true },
      { minLeadMinutes: 60 },
    );
    const services = promotionRule('services', { name: 'Services', value: 5000 });
    const saleContext = quoteContext({ channel: PromotionChannel.ADMIN });

    beforeEach(() => {
      snapshots.load.mockResolvedValue(salon([careTen, leadTime, services]));
      locations.getBookingSettings.mockResolvedValue({
        brandId: 'brand',
        timezone: 'UTC',
      });
      pricingContext.build.mockResolvedValue(saleContext);
      inventory.lastPurchaseUnitCosts.mockResolvedValue(
        new Map([['pl-shampoo', new Prisma.Decimal('19')]]),
      );
    });

    it('a sale: ADMIN, no visit, the seller; the line for the quantity', async () => {
      const result = await service.explain(
        'location',
        {
          ...base,
          staffId: 'anna',
          productId: 'shampoo',
          quantity: '2.000',
          clientId: 'client-1',
          promoCode: 'AUTUMN',
          channel: PromotionChannel.ONLINE,
        },
        true,
      );
      expect(pricingContext.build).toHaveBeenCalledWith({
        locationId: 'location',
        brandId: 'brand',
        timezone: 'UTC',
        clientId: 'client-1',
        promoCode: 'AUTUMN',
        channel: PromotionChannel.ADMIN,
        visitStartAt: null,
        sale: true,
        now: new Date('2026-12-04T18:00:00.000Z'),
      });
      expect(bookings.previewStaffing).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        kind: 'PRODUCT',
        staffId: 'anna',
        staffName: 'Anna',
        levelName: null,
        candidates: [],
        total: 3600,
      });
      // 2 x 20.00 = 40.00, -10% = 36.00.
      expect(result.line).toMatchObject({
        basePrice: 2000,
        staffPrice: 2000,
        listPrice: 4000,
        chargedPrice: 3600,
        total: 3600,
        discount: { kind: 'PROMOTION', ruleId: 'care', amount: -400 },
      });
      // Only promotions: surcharges never reach products.
      expect(
        result.notApplied.map((item) => [item.ruleId, item.kind, item.reason]),
      ).toEqual([
        ['lead', 'PROMOTION', 'NO_VISIT'],
        ['services', 'PROMOTION', 'NOT_TARGETED'],
      ]);
      // 36.00 < 2 x 19.00.
      expect(result.lastPurchaseUnitCost?.toFixed(2)).toBe('19.00');
      expect(result.belowCost).toBe(true);
    });

    it('a product of a booking: the visit start, channel and booking moment', async () => {
      await service.explain('location', {
        ...base,
        productId: 'shampoo',
        productContext: PriceExplainProductContext.BOOKING,
        channel: PromotionChannel.ONLINE,
        bookedAt: '2026-12-01T10:00:00',
      });
      expect(pricingContext.build).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: PromotionChannel.ONLINE,
          visitStartAt: new Date('2026-12-04T18:00:00.000Z'),
          now: new Date('2026-12-01T10:00:00.000Z'),
        }),
      );
      expect(pricingContext.build.mock.calls[0][0].sale).toBeUndefined();
    });

    it('quantity 1 by default; the cost number only with Read(INVENTORY)', async () => {
      const result = await service.explain('location', {
        ...base,
        productId: 'shampoo',
      });
      expect(result.line.listPrice).toBe(2000);
      expect(result.lastPurchaseUnitCost).toBeNull();
      // 18.00 < 19.00 even without the number.
      expect(result.belowCost).toBe(true);
    });

    it('imagines a known client by clientType: the product client discount stays empty', async () => {
      const result = await service.explain('location', {
        ...base,
        productId: 'shampoo',
        clientType: PriceExplainClientType.REGULAR,
      });
      expect(result.line.discount?.ruleId).toBe('care');
    });

    it('rejects a product the location does not sell, a fractional piece, two targets', async () => {
      await expect(
        service.explain('location', { ...base, productId: 'nope' }),
      ).rejects.toMatchObject({ errorCode: 'ORDER_PRODUCT_NOT_SELLABLE' });
      await expect(
        service.explain('location', {
          ...base,
          productId: 'shampoo',
          quantity: '1.500',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.explain('location', {
          ...base,
          productId: 'shampoo',
          quantity: '0.000',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.explain('location', {
          ...base,
          productId: 'shampoo',
          serviceId: 'cut',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.explain('location', {
          ...base,
          productId: 'shampoo',
          staffId: 'ghost',
        }),
      ).rejects.toMatchObject({ errorCode: 'BOOKING_STAFF_NOT_FOUND' });
    });

    it('a weighed product takes a fractional quantity', async () => {
      const result = await service.explain('location', {
        ...base,
        productId: 'oil',
        quantity: '0.500',
      });
      // 0.5 x 15.00 = 7.50; oil has no category: no discount.
      expect(result.line.listPrice).toBe(750);
      expect(result.line.discount).toBeNull();
    });
  });
});

import { BookingChannel, Prisma } from '@prisma/client';
import { DiscountChoiceMode } from '../../../pricing/engine/enums/discount-choice-mode.enum.js';
import { PromotionChannel } from '../../../pricing/engine/enums/promotion-channel.enum.js';
import {
  pricingSnapshot,
  promotionRule,
  surchargeRule,
  weekdays,
} from '../../../pricing/engine/testing/pricing-snapshot.factory.js';
import { createPricingFacadeStub } from '../../../pricing/testing/pricing-facade.stub.js';
import { BookingRepricingMode } from '../../enums/booking-repricing-mode.enum.js';
import { BookingRepricing } from '../../interfaces/booking-repricing.interface.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { bookingItemPrices } from '../../testing/factories/booking-item-prices.factory.js';
import { bookingPricingContextStub } from '../../testing/factories/booking-pricing-context.stub.js';
import { booking } from '../../testing/factories/booking.factory.js';
import { BookingRepricingService } from './booking-repricing.service.js';

/** Cut 60, wash 15; a booking of both with Anna on 2026-12-10 at 10:00 UTC. */
function setup(rules = [promotionRule('ten'), promotionRule('coded', { value: 2000 }, { promoCode: 'AUTUMN' })]) {
  const pricing = createPricingFacadeStub(
    pricingSnapshot({ services: { cut: 6000, wash: 1500 }, bundles: [], rules }),
  );
  const context = bookingPricingContextStub();
  const service = new BookingRepricingService(pricing, context, {
    getBookingSettings: vi.fn(async () => ({
      brandId: 'brand-1',
      timezone: 'UTC',
    })),
  } as never);
  const item = (id: string, serviceId: string, sortOrder: number, minutes: number) => ({
    id,
    serviceId,
    staffId: 'anna',
    sortOrder,
    startAt: new Date(Date.UTC(2026, 11, 10, 10, minutes)),
    customPrice: null as Prisma.Decimal | null,
  });
  const old = {
    id: 'booking-1',
    locationId: 'location-1',
    clientId: 'client-1',
    bundleId: null,
    promoCode: null as string | null,
    items: [item('item-wash', 'wash', 1, 60), item('item-cut', 'cut', 0, 0)],
  } as unknown as BookingWithItems;
  return { service, context, old };
}

describe('BookingRepricingService', () => {
  it('changes nothing when the edit picks no discount and keeps the code', async () => {
    const { service, old } = setup();
    expect(
      await service.plan(old, { items: [{ id: 'item-cut', customPrice: null }] }),
    ).toBeNull();
    expect(await service.plan(old, { promoCode: undefined })).toBeNull();
  });

  it('re-prices only the item whose discount is picked again', async () => {
    const { service, context, old } = setup();
    const plan = await service.plan(old, {
      items: [
        {
          id: 'item-cut',
          customPrice: null,
          promotion: { mode: DiscountChoiceMode.NONE },
        },
      ],
    });
    expect(context.build).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: PromotionChannel.ADMIN,
        clientId: 'client-1',
        bookingId: 'booking-1',
        visitStartAt: new Date(Date.UTC(2026, 11, 10, 10, 0)),
        // Items in booking order: cut is line 0.
        choice: { 0: { mode: DiscountChoiceMode.NONE, ruleId: null } },
      }),
    );
    expect(plan?.itemIds).toEqual(['item-cut']);
    expect(plan?.itemUpdates[0].data).toMatchObject({
      chargedPrice: new Prisma.Decimal('60.00'),
      discountTotal: new Prisma.Decimal('0.00'),
      priceAdjustments: { deleteMany: {}, create: [] },
    });
    expect(plan?.promoCode).toBeNull();
    expect(plan?.ruleIds).toEqual([]);
  });

  it('a new promo code re-prices every item and is stored when it applies', async () => {
    const { service, old } = setup();
    const plan = await service.plan(old, { promoCode: 'AUTUMN' });
    expect(plan?.itemIds).toEqual(['item-cut', 'item-wash']);
    expect(
      plan?.itemUpdates.map((update) =>
        (update.data.chargedPrice as Prisma.Decimal).toFixed(2),
      ),
    ).toEqual(['48.00', '12.00']);
    expect(plan?.promoCode).toBe('AUTUMN');
    expect(plan?.ruleIds).toEqual(['coded', 'coded']);
  });

  it('removing the code re-prices with the automatic promotions', async () => {
    const { service, old } = setup();
    const plan = await service.plan(
      { ...old, promoCode: 'AUTUMN' } as BookingWithItems,
      { promoCode: null },
    );
    expect(plan?.promoCode).toBeNull();
    expect(plan?.ruleIds).toEqual(['ten', 'ten']);
  });
});

/** At 2026-12-10 (UTC location) hh:mm. */
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 11, 10, hour, minute));

const EVENING = surchargeRule('evening', {
  value: 2000,
  weekdaysMask: weekdays(1, 2, 3, 4, 5, 6, 7),
  intervals: [{ start: 1080, end: 1440 }],
});
const MORNING = promotionRule('morning', {
  intervals: [{ start: 600, end: 720 }],
});
const CODED = promotionRule(
  'coded',
  { value: 2000, intervals: [{ start: 600, end: 720 }] },
  { promoCode: 'AUTUMN' },
);

/**
 * Cut 60 and wash 20 booked with Anna at 10:00 and 11:00, stored at those prices. By default
 * an evening surcharge +20% from 18:00, a morning promotion -10% from 10:00 to 12:00 and the
 * AUTUMN code -20% from 10:00 to 12:00.
 */
function moveSetup(rules = [EVENING, MORNING, CODED]) {
  const pricing = createPricingFacadeStub(
    pricingSnapshot({ services: { cut: 6000, wash: 2000 }, bundles: [], rules }),
  );
  const context = bookingPricingContextStub();
  const service = new BookingRepricingService(pricing, context, {
    getBookingSettings: vi.fn(async () => ({
      brandId: 'brand-1',
      timezone: 'UTC',
    })),
  } as never);
  const item = (
    id: string,
    serviceId: string,
    sortOrder: number,
    startAt: Date,
    price: string,
  ) => ({
    ...booking().items[0],
    id,
    bookingId: 'booking-1',
    serviceId,
    serviceTitle: serviceId,
    sortOrder,
    startAt,
    endAt: new Date(startAt.getTime() + 3_600_000),
    ...bookingItemPrices(price),
  });
  const old = booking({
    id: 'booking-1',
    locationId: 'location-1',
    clientId: 'client-1',
    startAt: at(10),
    endAt: at(12),
    createdAt: new Date('2026-11-01T08:00:00.000Z'),
    items: [
      item('item-cut', 'cut', 0, at(10), '60.00'),
      item('item-wash', 'wash', 1, at(11), '20.00'),
    ],
  });
  /** The items moved by `hours` (and to `staffId`), as the reschedule hands them over. */
  const moved = (hours: number, staffId = 'anna') =>
    old.items.map((entry) => ({
      ...entry,
      staffId,
      startAt: new Date(entry.startAt.getTime() + hours * 3_600_000),
    }));
  return { service, context, old, moved };
}

const charged = (plan: BookingRepricing | null) =>
  plan?.itemUpdates.map((update) =>
    (update.data.chargedPrice as Prisma.Decimal).toFixed(2),
  );

describe('BookingRepricingService on a move (stage 5)', () => {
  it('KEEP without a pick or a code change prices nothing, even when moved', async () => {
    const { service, old, moved } = moveSetup();
    expect(
      await service.plan(old, { startAt: '2026-12-10T18:00:00' }, moved(8)),
    ).toBeNull();
  });

  it('RECALCULATE adds the surcharge of the new time and drops the promotion of the old one', async () => {
    const { service, context, old, moved } = moveSetup();
    const plan = await service.plan(
      old,
      { pricing: BookingRepricingMode.RECALCULATE, expectedTotal: '96.00' },
      moved(8),
    );
    expect(charged(plan)).toEqual(['72.00', '24.00']);
    expect(plan?.itemIds).toEqual(['item-cut', 'item-wash']);
    expect(plan?.visitStartAt).toEqual(at(18));
    expect(plan?.ruleIds).toEqual([]);
    expect(context.build).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: PromotionChannel.ADMIN,
        visitStartAt: at(18),
        bookingId: 'booking-1',
        clientId: 'client-1',
      }),
    );
  });

  it('RECALCULATE without a move gives the promotion of the current time', async () => {
    const { service, old } = moveSetup();
    const plan = await service.plan(old, {
      pricing: BookingRepricingMode.RECALCULATE,
      expectedTotal: '72.00',
    });
    expect(charged(plan)).toEqual(['54.00', '18.00']);
    expect(plan?.ruleIds).toEqual(['morning', 'morning']);
  });

  it('RECALCULATE removes the surcharge when moved out of the evening', async () => {
    const { service, old, moved } = moveSetup([EVENING]);
    const evening = { ...old, startAt: at(18), items: moved(8) };
    const plan = await service.plan(
      evening,
      { pricing: BookingRepricingMode.RECALCULATE, expectedTotal: '80.00' },
      moved(4),
    );
    expect(charged(plan)).toEqual(['60.00', '20.00']);
  });

  it('a different total is 409 PRICE_CHANGED with the new prices', async () => {
    const { service, old, moved } = moveSetup();
    await expect(
      service.plan(
        old,
        { pricing: BookingRepricingMode.RECALCULATE, expectedTotal: '75.00' },
        moved(8),
      ),
    ).rejects.toMatchObject({
      errorCode: 'PRICE_CHANGED',
      payload: {
        expectedTotal: '75.00',
        total: '96.00',
        items: [
          {
            serviceId: 'cut',
            serviceTitle: 'cut',
            staffId: 'anna',
            staffName: 'Anna',
            price: '72.00',
          },
          expect.objectContaining({ serviceId: 'wash', price: '24.00' }),
        ],
      },
    });
  });

  it('keeps a custom price on every recalculation', async () => {
    const { service, old, moved } = moveSetup();
    old.items[0].customPrice = new Prisma.Decimal('42.00');
    const plan = await service.plan(
      old,
      { pricing: BookingRepricingMode.RECALCULATE, expectedTotal: '66.00' },
      moved(8),
    );
    expect(plan?.itemUpdates[0].data).toMatchObject({
      chargedPrice: new Prisma.Decimal('72.00'),
      customPrice: new Prisma.Decimal('42.00'),
    });
  });

  it('a stored promotion stays while it applies and is reset to AUTO when it does not', async () => {
    const { service, old, moved } = moveSetup([
      MORNING,
      promotionRule('all-day', { value: 500 }),
    ]);
    for (const entry of old.items) {
      entry.discountChoice = DiscountChoiceMode.RULE;
      entry.discountChoiceRuleId = 'all-day';
    }
    // At 10:00 the picked -5% stays although -10% is better; the pick is not rewritten.
    const kept = await service.plan(old, {
      pricing: BookingRepricingMode.RECALCULATE,
      expectedTotal: '76.00',
    });
    expect(charged(kept)).toEqual(['57.00', '19.00']);
    expect(kept?.itemUpdates[0].data).not.toHaveProperty('discountChoice');

    for (const entry of old.items) entry.discountChoiceRuleId = 'morning';
    // At 14:00 the picked morning promotion is over: the best one applies, the pick is cleared.
    const reset = await service.plan(
      old,
      { pricing: BookingRepricingMode.RECALCULATE, expectedTotal: '76.00' },
      moved(4),
    );
    expect(charged(reset)).toEqual(['57.00', '19.00']);
    expect(reset?.itemUpdates[0].data).toMatchObject({
      discountChoice: null,
      discountChoiceRuleId: null,
    });
  });

  it('a stored NONE stays: no discount at a time with a promotion', async () => {
    const { service, old } = moveSetup();
    old.items[0].discountChoice = DiscountChoiceMode.NONE;
    const plan = await service.plan(old, {
      pricing: BookingRepricingMode.RECALCULATE,
      expectedTotal: '78.00',
    });
    expect(charged(plan)).toEqual(['60.00', '18.00']);
    expect(plan?.itemUpdates[0].data).not.toHaveProperty('discountChoice');
  });

  it('removes a promo code that no longer applies at the new time and keeps one that does', async () => {
    const { service, old, moved } = moveSetup();
    const coded = { ...old, promoCode: 'AUTUMN' };
    const evening = await service.plan(
      coded,
      { pricing: BookingRepricingMode.RECALCULATE, expectedTotal: '96.00' },
      moved(8),
    );
    expect(evening?.promoCode).toBeNull();
    const morning = await service.plan(
      coded,
      { pricing: BookingRepricingMode.RECALCULATE, expectedTotal: '64.00' },
      moved(1),
    );
    expect(morning?.promoCode).toBe('AUTUMN');
    expect(charged(morning)).toEqual(['48.00', '16.00']);
  });

  it('prices a discount picked together with a move at the new time and staff (stage 4 fix)', async () => {
    const { service, context, old, moved } = moveSetup();
    const plan = await service.plan(
      old,
      {
        startAt: '2026-12-10T18:00:00',
        staffId: 'boris',
        items: [
          {
            id: 'item-cut',
            customPrice: null,
            promotion: { mode: DiscountChoiceMode.NONE },
          },
        ],
      },
      moved(8, 'boris'),
    );
    expect(context.build).toHaveBeenCalledWith(
      expect.objectContaining({ visitStartAt: at(18) }),
    );
    // Only the picked item gets layers, with the evening surcharge; the pick is stored.
    expect(plan?.itemIds).toEqual(['item-cut']);
    expect(plan?.itemUpdates[0].data).toMatchObject({
      chargedPrice: new Prisma.Decimal('72.00'),
      discountChoice: DiscountChoiceMode.NONE,
      discountChoiceRuleId: null,
    });
    expect(plan?.promoCode).toBeNull();
  });

  it('stores a picked promotion with its rule', async () => {
    const { service, old } = moveSetup();
    const plan = await service.plan(old, {
      items: [
        {
          id: 'item-wash',
          customPrice: null,
          promotion: { mode: DiscountChoiceMode.RULE, ruleId: 'morning' },
        },
      ],
    });
    expect(plan?.itemUpdates[0].data).toMatchObject({
      discountChoice: DiscountChoiceMode.RULE,
      discountChoiceRuleId: 'morning',
    });
  });

  it('a client move re-prices both ways by the channel, client, code and booking day of the booking', async () => {
    const { service, context, old, moved } = moveSetup();
    const online = {
      ...old,
      channel: BookingChannel.PUBLIC_PAGE,
      promoCode: 'AUTUMN',
    };
    const plan = await service.planClientMove(online, moved(8), '96.00');
    expect(charged(plan)).toEqual(['72.00', '24.00']);
    expect(plan?.promoCode).toBeNull();
    expect(context.build).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: PromotionChannel.ONLINE,
        clientId: 'client-1',
        promoCode: 'AUTUMN',
        bookedAt: old.createdAt,
        bookingId: 'booking-1',
        visitStartAt: at(18),
      }),
    );
    await expect(
      service.planClientMove(old, moved(1), '75.00'),
    ).rejects.toMatchObject({ errorCode: 'PRICE_CHANGED' });
    expect(context.build).toHaveBeenLastCalledWith(
      expect.objectContaining({ channel: PromotionChannel.ADMIN }),
    );
  });

  it('writes the layers, the other custom prices and the code, and holds the limits of the new layers', async () => {
    const { service, context, old } = moveSetup();
    const plan = await service.plan(old, {
      pricing: BookingRepricingMode.RECALCULATE,
      expectedTotal: '72.00',
    });
    expect(service.bookingWrite(plan)).toEqual({
      items: { update: plan?.itemUpdates },
      promoCode: null,
    });
    expect(
      service.bookingWrite(null, [{ id: 'item-cut', customPrice: '40.00' }]),
    ).toEqual({
      items: {
        update: [{ where: { id: 'item-cut' }, data: { customPrice: '40.00' } }],
      },
    });
    const tx = {} as Prisma.TransactionClient;
    await service.holdLimits(tx, old, plan);
    expect(context.assertLimitsHeld).toHaveBeenCalledWith(
      tx,
      'location-1',
      ['morning', 'morning'],
      'client-1',
      at(10),
      'booking-1',
    );
  });

  describe('a booking whose service was deactivated since', () => {
    const gone = () => {
      const setup = moveSetup();
      // Wash (stored at 20) is no longer in the catalog: cut 60 + 20 = 80.
      setup.old.items[1].serviceId = 'gone';
      return setup;
    };

    it('RECALCULATE and a pick are 409 BOOKING_REPRICE_UNAVAILABLE, not a 404', async () => {
      const { service, old, moved } = gone();
      await expect(
        service.plan(
          old,
          { pricing: BookingRepricingMode.RECALCULATE, expectedTotal: '80.00' },
          moved(8),
        ),
      ).rejects.toMatchObject({
        errorCode: 'BOOKING_REPRICE_UNAVAILABLE',
        status: 409,
      });
      await expect(
        service.plan(old, {
          items: [
            {
              id: 'item-cut',
              customPrice: null,
              promotion: { mode: DiscountChoiceMode.NONE },
            },
          ],
        }),
      ).rejects.toMatchObject({ errorCode: 'BOOKING_REPRICE_UNAVAILABLE' });
    });

    it('a client move keeps the prices, checked against the current total', async () => {
      const { service, context, old, moved } = gone();
      expect(await service.planClientMove(old, moved(8), '80.00')).toBeNull();
      expect(context.build).not.toHaveBeenCalled();
      await expect(
        service.planClientMove(old, moved(8), '96.00'),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_CHANGED',
        payload: {
          expectedTotal: '96.00',
          total: '80.00',
          items: [
            expect.objectContaining({ serviceId: 'cut', price: '60.00' }),
            expect.objectContaining({ serviceId: 'gone', price: '20.00' }),
          ],
        },
      });
      expect(service.bookingWrite(null)).toEqual({});
    });
  });
});

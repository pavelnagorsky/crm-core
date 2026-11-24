import { Prisma } from '@prisma/client';
import { DiscountChoiceMode } from '../../../pricing/engine/enums/discount-choice-mode.enum.js';
import { PromotionChannel } from '../../../pricing/engine/enums/promotion-channel.enum.js';
import {
  pricingSnapshot,
  promotionRule,
} from '../../../pricing/engine/testing/pricing-snapshot.factory.js';
import { createPricingFacadeStub } from '../../../pricing/testing/pricing-facade.stub.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { bookingPricingContextStub } from '../../testing/factories/booking-pricing-context.stub.js';
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

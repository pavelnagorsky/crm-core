import { BookingExecutionMode, Prisma } from '@prisma/client';
import { DiscountChoiceMode } from '../../pricing/engine/enums/discount-choice-mode.enum.js';
import {
  pricingSnapshot,
  promotionRule,
  sumBundle,
} from '../../pricing/engine/testing/pricing-snapshot.factory.js';
import { createPricingFacadeStub } from '../../pricing/testing/pricing-facade.stub.js';
import { bookingPricingContextStub } from '../testing/factories/booking-pricing-context.stub.js';
import { BookingSelectionService } from './booking-selection.service.js';

/** A SUM bundle of cut 60 and color 90; promotions -10% and -5% on everything, all day. */
function setup() {
  const pricing = createPricingFacadeStub(
    pricingSnapshot({
      services: { cut: 6000, color: 9000 },
      bundles: [sumBundle('bundle', ['cut', 'color'])],
      rules: [promotionRule('ten'), promotionRule('five', { value: 500 })],
    }),
  );
  const service = (id: string) => ({
    id,
    title: id,
    durationMinutes: 60,
    bufferMinutes: 0,
  });
  const catalog = {
    resolveBundleForBooking: vi.fn(async () => ({
      id: 'bundle',
      title: 'Bundle',
      executionMode: BookingExecutionMode.SEQUENTIAL,
      items: [{ service: service('cut') }, { service: service('color') }],
    })),
  };
  // The booking stored "five" for the cut and no discount for the color.
  const bookings = {
    findDiscountChoices: vi.fn(async () => [
      {
        serviceId: 'cut',
        discountChoice: DiscountChoiceMode.RULE,
        discountChoiceRuleId: 'five',
      },
      {
        serviceId: 'color',
        discountChoice: DiscountChoiceMode.NONE,
        discountChoiceRuleId: null,
      },
    ]),
  };
  const selection = new BookingSelectionService(
    {
      findById: vi.fn(async () => ({
        brandId: 'brand-1',
        timezone: 'UTC',
        currency: 'BYN',
      })),
    } as never,
    catalog as never,
    { priceProductItems: vi.fn(async () => []) } as never,
    pricing,
    bookingPricingContextStub(),
    bookings as never,
  );
  return { selection, bookings };
}

const total = (value: Prisma.Decimal) => value.toFixed(2);

describe('BookingSelectionService preview of an edited bundle booking', () => {
  it('applies the stored picks of the booking items to the bundle lines, as repricing does', async () => {
    const { selection, bookings } = setup();
    const preview = (bookingId: string | null) =>
      selection.price(
        'location-1',
        { bundleId: 'bundle', startAt: '2026-12-10T10:00:00', bookingId },
        { cabinet: true },
      );
    // Cut 60 - 5% (stored), color 90 without a discount (stored NONE).
    const edited = await preview('booking-1');
    expect(total(edited.serviceTotal)).toBe('147.00');
    expect(bookings.findDiscountChoices).toHaveBeenCalledWith(
      'location-1',
      'booking-1',
    );
    // A new booking gets the best one on both lines.
    const fresh = await preview(null);
    expect(total(fresh.serviceTotal)).toBe('135.00');
  });

  it('skips a stored pick whose service is not at that position', async () => {
    const { selection, bookings } = setup();
    bookings.findDiscountChoices.mockResolvedValueOnce([
      {
        serviceId: 'color',
        discountChoice: DiscountChoiceMode.NONE,
        discountChoiceRuleId: null,
      },
    ]);
    const result = await selection.price(
      'location-1',
      {
        bundleId: 'bundle',
        startAt: '2026-12-10T10:00:00',
        bookingId: 'booking-1',
      },
      { cabinet: true },
    );
    expect(total(result.serviceTotal)).toBe('135.00');
  });
});

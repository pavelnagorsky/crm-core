import { BookingExecutionMode, Prisma } from '@prisma/client';
import { DiscountChoiceMode } from '../../pricing/engine/enums/discount-choice-mode.enum.js';
import { PromoCodeStatus } from '../../pricing/engine/enums/promo-code-status.enum.js';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import {
  pricingSnapshot,
  promotionRule,
  sumBundle,
} from '../../pricing/engine/testing/pricing-snapshot.factory.js';
import { createPricingFacadeStub } from '../../pricing/testing/pricing-facade.stub.js';
import { pricingContextStub } from '../../pricing/testing/pricing-context.stub.js';
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
    findByIdInLocation: vi.fn(async () => ({
      createdAt: new Date('2026-11-01T08:00:00.000Z'),
    })),
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
  // Shampoo 2 x 20 with a -10% promotion of the products: 36.00.
  const orders = {
    priceVisitProducts: vi.fn(async () => ({
      lines: [
        {
          orderItemId: null,
          productId: 'shampoo',
          productLocationId: 'pl-shampoo',
          title: 'Shampoo',
          sku: null,
          unit: 'PIECE',
          quantity: new Prisma.Decimal(2),
          sellerStaffId: null,
          price: {
            productLocationId: 'pl-shampoo',
            productId: 'shampoo',
            baseUnitPrice: new Prisma.Decimal(20),
            listUnitPrice: new Prisma.Decimal(20),
            listLineTotal: new Prisma.Decimal(40),
            customUnitPrice: null,
            unitPrice: new Prisma.Decimal(20),
            lineSubtotal: new Prisma.Decimal(40),
            discountTotal: new Prisma.Decimal(4),
            lineTotal: new Prisma.Decimal(36),
            adjustments: [{ kind: 'PROMOTION', ruleId: 'goods' }],
            discount: { kind: 'PROMOTION', ruleId: 'goods' },
            eligible: [],
            ineligible: [],
          },
          promotion: { mode: DiscountChoiceMode.RULE, ruleId: 'goods' },
          lastPurchaseUnitCost: new Prisma.Decimal(25),
          belowCost: true,
        },
      ],
      quote: {
        promoCode: {
          code: 'GOODS',
          status: PromoCodeStatus.APPLIED,
          ruleId: 'goods',
          reason: null,
        },
      },
    })),
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
    orders as never,
    pricing,
    pricingContextStub(),
    bookings as never,
    { assignTeam: vi.fn(async () => null) } as never,
    { namesByIds: vi.fn(async () => new Map()) } as never,
  );
  return { selection, bookings, orders };
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

describe('BookingSelectionService products of the booking window', () => {
  const request = {
    bundleId: 'bundle',
    startAt: '2026-12-10T10:00:00',
    bookingId: 'booking-1',
    clientId: 'client-1',
    promoCode: 'GOODS',
    products: [
      {
        productId: 'shampoo',
        quantity: '2',
        promotion: { mode: DiscountChoiceMode.RULE, ruleId: 'goods' },
      },
    ],
  };

  it('prices them in the context of the edited booking, with its order', async () => {
    const { selection, orders } = setup();
    const result = await selection.price('location-1', request, {
      cabinet: true,
      canReadPurchaseCost: true,
    });
    expect(orders.priceVisitProducts).toHaveBeenCalledWith(
      'location-1',
      { brandId: 'brand-1', timezone: 'UTC' },
      expect.objectContaining({
        bookingId: 'booking-1',
        startAt: new Date('2026-12-10T10:00:00.000Z'),
        bookedAt: new Date('2026-11-01T08:00:00.000Z'),
        channel: PromotionChannel.ADMIN,
        clientId: 'client-1',
        promoCode: 'GOODS',
      }),
      request.products,
      ReadConsistency.CACHED,
      { canReadPurchaseCost: true },
    );
    const visit = (orders.priceVisitProducts.mock.calls[0] as unknown[])[2] as {
      servicesListTotal: Prisma.Decimal;
    };
    // The list prices of the services: cut 60 + color 90.
    expect(total(visit.servicesListTotal)).toBe('150.00');
    expect(result.items[2]).toMatchObject({
      catalogItemId: 'shampoo',
      lineTotal: new Prisma.Decimal(36),
      discount: { ruleId: 'goods' },
      adjustments: [{ ruleId: 'goods' }],
      promotion: { mode: DiscountChoiceMode.RULE, ruleId: 'goods' },
      lastPurchaseUnitCost: new Prisma.Decimal(25),
      belowCost: true,
    });
    expect(total(result.productTotal)).toBe('36.00');
    expect(total(result.discountTotal)).toBe(
      total(
        result.items
          .slice(0, 2)
          .reduce((sum, line) => sum.plus(line.discountTotal), new Prisma.Decimal(4)),
      ),
    );
    // The code applies only to the products: the merged result is APPLIED.
    expect(result.promoCode).toMatchObject({
      code: 'GOODS',
      status: PromoCodeStatus.APPLIED,
    });
  });

  it('online: no booking, no pick, no layer and no purchase price', async () => {
    const { selection, orders } = setup();
    const { bookingId: _bookingId, clientId: _clientId, ...rest } = request;
    const result = await selection.price('location-1', {
      ...rest,
      products: [{ productId: 'shampoo', quantity: '2' }],
    });
    expect(orders.priceVisitProducts).toHaveBeenCalledWith(
      'location-1',
      expect.anything(),
      expect.objectContaining({
        bookingId: null,
        channel: PromotionChannel.ONLINE,
        clientId: null,
      }),
      expect.anything(),
      ReadConsistency.CACHED,
      { canReadPurchaseCost: false },
    );
    expect(result.items[2]).toMatchObject({
      adjustments: [],
      promotion: null,
      lastPurchaseUnitCost: null,
      belowCost: false,
      eligible: [],
      ineligible: [],
    });
  });
});

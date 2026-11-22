import { HttpStatus } from '@nestjs/common';
import { BundlePricingMode, Prisma } from '@prisma/client';
import { ReadConsistency } from '../../shared/cache/enums/read-consistency.enum.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { ServiceLinePrice } from './interfaces/service-line-price.interface.js';
import { ServicePriceLineRequest } from './interfaces/service-price-line-request.interface.js';
import { PricingFacade } from './pricing.facade.js';
import { PricingSnapshotService } from './services/pricing-snapshot.service.js';
import { bookingCatalogSnapshot } from './testing/booking-catalog-snapshot.factory.js';
import { rejectedAppException } from './testing/rejected-app-exception.js';

const dec = (value: string) => new Prisma.Decimal(value);

function line(
  serviceId: string,
  customPrice: string | null = null,
): ServicePriceLineRequest {
  return {
    serviceId,
    staffId: 'anna',
    customPrice: customPrice === null ? null : dec(customPrice),
  };
}

/** Money layers of a line as fixed-scale strings. */
function layers(price: ServiceLinePrice) {
  return {
    serviceId: price.serviceId,
    basePrice: price.basePrice.toFixed(2),
    staffPrice: price.staffPrice.toFixed(2),
    listPrice: price.listPrice.toFixed(2),
    discountTotal: price.discountTotal.toFixed(2),
    chargedPrice: price.chargedPrice.toFixed(2),
    customPrice: price.customPrice?.toFixed(2) ?? null,
  };
}

function pricingFacade(catalog = bookingCatalogSnapshot()) {
  const loadCatalogSnapshot = vi.fn(async () => catalog);
  const snapshots = new PricingSnapshotService({
    loadCatalogSnapshot,
  } as never);
  const load = vi.spyOn(snapshots, 'load');
  return { facade: new PricingFacade(snapshots), load, loadCatalogSnapshot };
}

describe('PricingFacade', () => {
  describe.each([
    [
      'separate services',
      null,
      [line('cut'), line('color')],
      [
        ['60.00', null],
        ['90.00', null],
      ],
    ],
    [
      'SUM bundle',
      'sum-bundle',
      [line('cut'), line('color')],
      [
        ['60.00', null],
        ['90.00', null],
      ],
    ],
    [
      'FIXED bundle',
      'fixed-bundle',
      [line('cut'), line('color')],
      [
        ['48.00', null],
        ['72.00', null],
      ],
    ],
    [
      'custom prices',
      null,
      [line('cut', '55.5'), line('color', '0')],
      [
        ['60.00', '55.50'],
        ['90.00', '0.00'],
      ],
    ],
  ])('%s', (_name, bundleId, lines, expected) => {
    it('returns Decimal layers converted exactly from the catalog', async () => {
      const { facade } = pricingFacade();
      const quote = await facade.quoteServices(
        'location',
        { bundleId, lines },
        ReadConsistency.CACHED,
      );
      expect(quote.lines.map(layers)).toEqual(
        expected.map(([price, customPrice], index) => ({
          serviceId: lines[index].serviceId,
          basePrice: price,
          staffPrice: price,
          listPrice: price,
          discountTotal: '0.00',
          chargedPrice: price,
          customPrice,
        })),
      );
      for (const price of quote.lines) {
        expect(price.basePrice).toBeInstanceOf(Prisma.Decimal);
        expect(price.adjustments).toEqual([]);
      }
    });
  });

  it('keeps cents through the minor-unit round trip', async () => {
    const { facade } = pricingFacade(
      bookingCatalogSnapshot({
        services: { cut: '33.33', color: '0.01' },
        bundles: [
          {
            id: 'fixed',
            pricingMode: BundlePricingMode.FIXED,
            fixedPrice: '100.01',
            serviceIds: ['cut', 'color'],
          },
        ],
      }),
    );
    const separate = await facade.quoteServices(
      'location',
      { bundleId: null, lines: [line('cut', '12.34'), line('color')] },
      ReadConsistency.FRESH,
    );
    expect(separate.lines.map(layers)).toMatchObject([
      { basePrice: '33.33', customPrice: '12.34' },
      { basePrice: '0.01', customPrice: null },
    ]);
    const bundle = await facade.quoteServices(
      'location',
      { bundleId: 'fixed', lines: [line('cut'), line('color')] },
      ReadConsistency.FRESH,
    );
    const shares = bundle.lines.map((price) => price.basePrice);
    expect(shares.map((share) => share.toFixed(2))).toEqual(['99.98', '0.03']);
    expect(shares[0].plus(shares[1]).toFixed(2)).toBe('100.01');
  });

  it.each([
    [
      'unknown service',
      null,
      'missing',
      ErrorCode.BOOKING_SERVICE_NOT_FOUND.code,
      HttpStatus.NOT_FOUND,
    ],
    [
      'unknown bundle',
      'missing',
      'cut',
      ErrorCode.BOOKING_BUNDLE_NOT_FOUND.code,
      HttpStatus.NOT_FOUND,
    ],
    [
      'FIXED bundle without a price',
      'no-price',
      'cut',
      ErrorCode.BUNDLE_FIXED_PRICE_REQUIRED.code,
      HttpStatus.BAD_REQUEST,
    ],
  ])(
    'rejects %s with %s',
    async (_name, bundleId, serviceId, errorCode, status) => {
      const { facade } = pricingFacade(
        bookingCatalogSnapshot({
          bundles: [
            {
              id: 'no-price',
              pricingMode: BundlePricingMode.FIXED,
              fixedPrice: null,
              serviceIds: ['cut'],
            },
          ],
        }),
      );
      const error = await rejectedAppException(
        facade.quoteServices(
          'location',
          { bundleId, lines: [line(serviceId)] },
          ReadConsistency.CACHED,
        ),
      );
      expect(error.errorCode).toBe(errorCode);
      expect(error.getStatus()).toBe(status);
    },
  );

  it.each([
    ['a missing item', ['cut']],
    ['an extra item', ['cut', 'color', 'wash']],
    ['a foreign service', ['cut', 'wash']],
    ['a repeated service', ['cut', 'cut']],
  ])(
    'answers 409 BOOKING_BUNDLE_CHANGED for bundle lines with %s',
    async (_case, serviceIds) => {
      const { facade } = pricingFacade(
        bookingCatalogSnapshot({
          services: { cut: '60.00', color: '90.00', wash: '15.00' },
        }),
      );
      const error = await rejectedAppException(
        facade.quoteServices(
          'location',
          { bundleId: 'fixed-bundle', lines: serviceIds.map((id) => line(id)) },
          ReadConsistency.FRESH,
        ),
      );
      expect(error.errorCode).toBe(ErrorCode.BOOKING_BUNDLE_CHANGED.code);
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    },
  );

  it('prices bundle lines in the caller order: item order is not part of the check', async () => {
    const { facade } = pricingFacade();
    const { lines } = await facade.quoteServices(
      'location',
      { bundleId: 'fixed-bundle', lines: [line('color'), line('cut')] },
      ReadConsistency.FRESH,
    );
    expect(lines.map(layers)).toEqual([
      expect.objectContaining({ serviceId: 'color', basePrice: '72.00' }),
      expect.objectContaining({ serviceId: 'cut', basePrice: '48.00' }),
    ]);
  });

  it.each([ReadConsistency.CACHED, ReadConsistency.FRESH])(
    'forwards %s to the snapshot loader',
    async (consistency) => {
      const { facade, load, loadCatalogSnapshot } = pricingFacade();
      await facade.quoteServices(
        'location',
        { bundleId: null, lines: [line('cut')] },
        consistency,
      );
      expect(load).toHaveBeenCalledExactlyOnceWith('location', consistency);
      expect(loadCatalogSnapshot).toHaveBeenCalledExactlyOnceWith(
        'location',
        consistency,
      );
    },
  );
});

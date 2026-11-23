import { HttpStatus } from '@nestjs/common';
import { BundlePricingMode, Prisma } from '@prisma/client';
import { ReadConsistency } from '../../shared/cache/enums/read-consistency.enum.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { ServiceLinePrice } from './interfaces/service-line-price.interface.js';
import { ServicePriceLineRequest } from './interfaces/service-price-line-request.interface.js';
import { PricingFacade } from './pricing.facade.js';
import { PricingSnapshotServiceOptions } from './testing/interfaces/pricing-snapshot-service-options.interface.js';
import {
  priceLevelRow,
  pricingSnapshotService,
  staffPricingProfile,
} from './testing/pricing-snapshot-service.factory.js';
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

function pricingFacade(
  catalog = bookingCatalogSnapshot(),
  sources: PricingSnapshotServiceOptions = {},
) {
  const { service: snapshots, ...spies } = pricingSnapshotService({
    ...sources,
    catalog,
  });
  const load = vi.spyOn(snapshots, 'load');
  return { facade: new PricingFacade(snapshots), load, ...spies };
}

/** Senior level: cut 80.00, color 70.00. Boris is Senior, Dmitri is Senior with a personal cut 75.00. */
const leveledSources: PricingSnapshotServiceOptions = {
  levels: [
    priceLevelRow('base', 'Базовый', true),
    priceLevelRow('senior', 'Старший', false, 1),
  ],
  levelPrices: [
    { serviceId: 'cut', priceLevelId: 'senior', price: dec('80.00') },
    { serviceId: 'color', priceLevelId: 'senior', price: dec('70.00') },
  ],
  staff: [
    staffPricingProfile('anna'),
    staffPricingProfile('boris', 'senior'),
    staffPricingProfile('dmitri', 'senior', { cut: '75.00' }),
  ],
};

function lineWith(
  serviceId: string,
  staffId: string | null,
): ServicePriceLineRequest {
  return { serviceId, staffId, customPrice: null };
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
      const { facade, load } = pricingFacade();
      await facade.quoteServices(
        'location',
        { bundleId: null, lines: [line('cut')] },
        consistency,
      );
      expect(load).toHaveBeenCalledExactlyOnceWith('location', consistency);
    },
  );

  it('reads through the snapshot cache when CACHED and not when FRESH', async () => {
    const { facade, listPricingProfiles } = pricingFacade();
    const quote = (consistency: ReadConsistency) =>
      facade.quoteServices(
        'location',
        { bundleId: null, lines: [line('cut')] },
        consistency,
      );
    await quote(ReadConsistency.CACHED);
    await quote(ReadConsistency.CACHED);
    expect(listPricingProfiles).toHaveBeenCalledTimes(1);
    await quote(ReadConsistency.FRESH);
    expect(listPricingProfiles).toHaveBeenCalledTimes(2);
  });

  describe('staff prices', () => {
    const quote = (
      bundleId: string | null,
      lines: ServicePriceLineRequest[],
    ) => {
      const { facade } = pricingFacade(undefined, leveledSources);
      return facade.quoteServices(
        'location',
        { bundleId, lines },
        ReadConsistency.FRESH,
      );
    };

    it.each([
      ['no staff', null, 'cut', '60.00', []],
      ['unknown staff', 'nobody', 'cut', '60.00', []],
      ['default level staff', 'anna', 'cut', '60.00', []],
      [
        'level price above base',
        'boris',
        'cut',
        '80.00',
        [['LEVEL', 'Старший', '20.00']],
      ],
      [
        'level price below base',
        'boris',
        'color',
        '70.00',
        [['LEVEL', 'Старший', '-20.00']],
      ],
      [
        'personal price wins over the level',
        'dmitri',
        'cut',
        '75.00',
        [['STAFF', 'dmitri', '15.00']],
      ],
      [
        'level price when there is no personal price',
        'dmitri',
        'color',
        '70.00',
        [['LEVEL', 'Старший', '-20.00']],
      ],
    ])('%s', async (_name, staffId, serviceId, staffPrice, adjustments) => {
      const { lines } = await quote(null, [lineWith(serviceId, staffId)]);
      expect(lines[0].staffPrice.toFixed(2)).toBe(staffPrice);
      expect(lines[0].listPrice.toFixed(2)).toBe(staffPrice);
      expect(lines[0].chargedPrice.toFixed(2)).toBe(staffPrice);
      expect(lines[0].basePrice.toFixed(2)).toBe(
        serviceId === 'cut' ? '60.00' : '90.00',
      );
      expect(
        lines[0].adjustments.map(({ kind, title, amount }) => [
          kind,
          title,
          amount.toFixed(2),
        ]),
      ).toEqual(adjustments);
      expect(lines[0].adjustments.map(({ sortOrder }) => sortOrder)).toEqual(
        adjustments.map((_item, index) => index),
      );
    });

    it('a SUM bundle uses the prices of the staff member of each line', async () => {
      const { lines } = await quote('sum-bundle', [
        lineWith('cut', 'boris'),
        lineWith('color', 'dmitri'),
      ]);
      expect(lines.map((price) => price.staffPrice.toFixed(2))).toEqual([
        '80.00',
        '70.00',
      ]);
    });

    it('a FIXED bundle ignores the staff', async () => {
      const { lines } = await quote('fixed-bundle', [
        lineWith('cut', 'boris'),
        lineWith('color', 'dmitri'),
      ]);
      expect(lines.map((price) => price.staffPrice.toFixed(2))).toEqual([
        '48.00',
        '72.00',
      ]);
      expect(lines.flatMap((price) => price.adjustments)).toEqual([]);
    });

    it('a custom price keeps the staff layer as history', async () => {
      const { lines } = await quote(null, [
        { serviceId: 'cut', staffId: 'boris', customPrice: dec('55.5') },
      ]);
      expect(layers(lines[0])).toMatchObject({
        basePrice: '60.00',
        staffPrice: '80.00',
        chargedPrice: '80.00',
        customPrice: '55.50',
      });
    });
  });

  describe('priceBook', () => {
    it.each([ReadConsistency.CACHED, ReadConsistency.FRESH])(
      'forwards %s to the snapshot loader',
      async (consistency) => {
        const { facade, load } = pricingFacade();
        await facade.priceBook('location', consistency);
        expect(load).toHaveBeenCalledExactlyOnceWith('location', consistency);
      },
    );

    it('prices staff in minor units and a FIXED bundle as 0', async () => {
      const { facade } = pricingFacade(undefined, leveledSources);
      const book = await facade.priceBook('location', ReadConsistency.CACHED);
      expect(book.staffPrice('cut', 'boris')).toBe(8000);
      expect(book.staffPrice('cut', 'dmitri')).toBe(7500);
      expect(book.staffPrice('cut', 'anna')).toBe(6000);
      expect(book.candidatePrice('cut', 'boris', 'fixed-bundle')).toBe(0);
      expect(book.candidatePrice('cut', 'boris', 'sum-bundle')).toBe(8000);
    });
  });
});

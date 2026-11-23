import { BookingExecutionMode, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import {
  fixedBundle,
  priceLevel,
  pricingSnapshot,
  pricingStaff,
  sumBundle,
} from '../../../pricing/engine/testing/pricing-snapshot.factory.js';
import { createPricingFacadeStub } from '../../../pricing/testing/pricing-facade.stub.js';
import { BookingSetupService } from './booking-setup.service.js';

const money = (value: string) => new Prisma.Decimal(value);

function catalogService(id: string, price: string) {
  return {
    id,
    categoryId: null,
    title: id,
    description: null,
    price: money(price),
    durationMinutes: 30,
    bufferMinutes: 0,
    sortOrder: 0,
    status: 'ACTIVE',
    imageFile: null,
  };
}

function bundleOf(
  id: string,
  serviceIds: string[],
  fixedPrice: string | null = null,
) {
  return {
    id,
    categoryId: null,
    title: id,
    description: null,
    pricingMode: fixedPrice === null ? 'SUM' : 'FIXED',
    fixedPrice: fixedPrice === null ? null : money(fixedPrice),
    executionMode: BookingExecutionMode.SEQUENTIAL,
    sortOrder: 0,
    imageFile: null,
    items: serviceIds.map((serviceId, sortOrder) => ({
      serviceId,
      sortOrder,
      service: catalogService(serviceId, '0'),
    })),
  };
}

function directoryStaff(id: string, serviceIds: string[]) {
  return {
    id,
    name: id,
    roleTitle: null,
    description: null,
    avatarFile: null,
    staffServices: serviceIds.map((serviceId) => ({ serviceId })),
  };
}

type Selection = {
  bundleId: string | null;
  services: unknown[];
  executionMode: BookingExecutionMode;
};

function setup(
  options: {
    isOnlineBookingOpen?: boolean;
    anyStaffEnabled?: boolean;
    catalog?: { services: unknown[]; bundles: unknown[] };
    directory?: unknown[];
    pricing?: ReturnType<typeof createPricingFacadeStub>;
    scheduling?: unknown;
    selection?: Selection;
  } = {},
) {
  const catalog = options.catalog ?? { services: [], bundles: [] };
  const location = {
    getBookingSettings: vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      anyStaffEnabled: options.anyStaffEnabled ?? true,
      anyStaffRule: 'CHEAPER_AND_FREER',
      timezone: 'UTC',
    }),
  };
  const billing = {
    isOnlineBookingOpen: vi
      .fn()
      .mockResolvedValue(options.isOnlineBookingOpen ?? true),
  };
  const service = new BookingSetupService(
    { loadForBooking: vi.fn().mockResolvedValue(catalog) } as never,
    {
      listActiveWithServices: vi
        .fn()
        .mockResolvedValue(options.directory ?? []),
    } as never,
    { listForPublicCatalog: vi.fn().mockResolvedValue([]) } as never,
    location as never,
    {
      resolveForBooking: vi.fn().mockResolvedValue(options.selection),
    } as never,
    (options.scheduling ?? { resolveForBooking: vi.fn() }) as never,
    billing as never,
    options.pricing ?? createPricingFacadeStub(),
  );
  return { service, location, billing, catalog };
}

/** Cut 60 (anna 60, boris on level 80, carl personal 70), color 90 nobody performs. */
function pricedSalon() {
  const pricing = createPricingFacadeStub(
    pricingSnapshot({
      services: { cut: 6000, color: 9000 },
      bundles: [sumBundle('sum'), fixedBundle('fixed', 12000)],
      levels: [priceLevel('base', 'Base', true), priceLevel('top', 'Top')],
      levelPrices: { cut: { top: 8000 } },
      staff: [
        pricingStaff('anna'),
        pricingStaff('boris', 'top'),
        pricingStaff('carl', null, { cut: 7000 }),
      ],
    }),
  );
  const catalog = {
    services: [catalogService('cut', '60'), catalogService('color', '90')],
    bundles: [
      bundleOf('sum', ['cut', 'color']),
      bundleOf('fixed', ['cut', 'color'], '120'),
    ],
  };
  const directory = [
    directoryStaff('anna', ['cut']),
    directoryStaff('boris', ['cut']),
    directoryStaff('carl', ['cut']),
  ];
  return { pricing, catalog, directory };
}

const format = (value: Prisma.Decimal) => MoneyUtils.format(value);

describe('BookingSetupService.getBookingSetup', () => {
  it('reports online booking as unavailable when billing closes it', async () => {
    const { service, location, billing, catalog } = setup({
      isOnlineBookingOpen: false,
    });

    const result = await service.getBookingSetup('location-1');

    expect(location.getBookingSettings).toHaveBeenCalledWith('location-1');
    expect(billing.isOnlineBookingOpen).toHaveBeenCalledWith('brand-1');
    expect(result).toMatchObject({
      catalog,
      staff: [],
      products: [],
      isOnlineBookingAvailable: false,
    });
  });

  it('reports online booking as available when billing keeps it open', async () => {
    const { service } = setup();

    await expect(service.getBookingSetup('location-1')).resolves.toMatchObject({
      isOnlineBookingAvailable: true,
    });
  });

  it.each([true, false])(
    'passes the location "any staff" switch through: %s',
    async (anyStaffEnabled) => {
      const { service } = setup({ anyStaffEnabled });

      await expect(
        service.getBookingSetup('location-1'),
      ).resolves.toMatchObject({ anyStaffEnabled });
    },
  );

  it('prices services from the lowest to the highest staff price', async () => {
    const { pricing, catalog, directory } = pricedSalon();
    const { service } = setup({ pricing, catalog, directory });

    const { prices } = await service.getBookingSetup('location-1');

    const range = (id: string) => {
      const entry = prices.services.get(id)!;
      return [format(entry.priceFrom), format(entry.priceTo)];
    };
    expect(range('cut')).toEqual(['60.00', '80.00']);
    // Nobody performs color: the base price.
    expect(range('color')).toEqual(['90.00', '90.00']);
  });

  it('prices a SUM bundle by its services and a FIXED bundle as one package', async () => {
    const { pricing, catalog, directory } = pricedSalon();
    const { service } = setup({ pricing, catalog, directory });

    const { prices } = await service.getBookingSetup('location-1');

    const range = (id: string) => {
      const entry = prices.bundles.get(id)!;
      return [format(entry.priceFrom), format(entry.priceTo)];
    };
    expect(range('sum')).toEqual(['150.00', '170.00']);
    expect(range('fixed')).toEqual(['120.00', '120.00']);
  });

  it('lists the price of each service a staff member performs', async () => {
    const { pricing, catalog, directory } = pricedSalon();
    const { service } = setup({ pricing, catalog, directory });

    const { prices } = await service.getBookingSetup('location-1');

    const byStaff = (id: string) =>
      prices.staffServicePrices
        .get(id)!
        .map((item) => [item.serviceId, format(item.price)]);
    expect(byStaff('anna')).toEqual([['cut', '60.00']]);
    expect(byStaff('boris')).toEqual([['cut', '80.00']]);
    expect(byStaff('carl')).toEqual([['cut', '70.00']]);
  });

  it('falls back to the catalog price for a service the price book lacks', async () => {
    const { catalog, directory } = pricedSalon();
    const { service } = setup({ catalog, directory });

    const { prices } = await service.getBookingSetup('location-1');

    expect(format(prices.services.get('cut')!.priceFrom)).toBe('60.00');
    // A staff price of a service outside the book is not offered.
    expect(prices.staffServicePrices.get('anna')).toEqual([]);
  });
});

describe('BookingSetupService.resolveBookingSelection prices', () => {
  const prices = (staff: { id: string; price: Prisma.Decimal }[]) =>
    Object.fromEntries(
      staff.map((member) => [member.id, format(member.price)]),
    );

  it('gives each staff member their price for the selection and for each service', async () => {
    const { pricing, catalog, directory } = pricedSalon();
    const { service } = setup({ pricing, catalog, directory });

    const result = await service.resolveBookingSelection('location-1', {
      serviceIds: ['cut'],
    });

    const expected = { anna: '60.00', boris: '80.00', carl: '70.00' };
    expect(prices(result.availableStaff)).toEqual(expected);
    expect(prices(result.staffByService[0].availableStaff)).toEqual(expected);
    expect(result.totalPrice).toBeNull();
  });

  it('gives every staff member the package price of a FIXED bundle', async () => {
    const { pricing, catalog } = pricedSalon();
    const directory = [
      directoryStaff('anna', ['cut', 'color']),
      directoryStaff('boris', ['cut', 'color']),
    ];
    const { service } = setup({ pricing, catalog, directory });

    const result = await service.resolveBookingSelection('location-1', {
      bundleId: 'fixed',
    });

    expect(prices(result.availableStaff)).toEqual({
      anna: '120.00',
      boris: '120.00',
    });
  });

  it('returns the exact total of the preview when a start time is given', async () => {
    const { pricing, catalog, directory } = pricedSalon();
    const charged = (value: string) => ({
      serviceId: 'cut',
      staffId: 'boris',
      sortOrder: 0,
      startAt: new Date('2026-11-10T10:00:00Z'),
      endAt: new Date('2026-11-10T10:30:00Z'),
      serviceTitle: 'cut',
      serviceDuration: 30,
      basePrice: money('60'),
      staffPrice: money('80'),
      listPrice: money('80'),
      discountTotal: money('0'),
      chargedPrice: money(value),
      customPrice: null,
      priceAdjustments: [],
      staffName: 'boris',
    });
    const scheduling = {
      resolveForBooking: vi.fn(async () => [charged('80'), charged('15.50')]),
    };
    const { service } = setup({
      pricing,
      catalog,
      directory,
      scheduling,
      selection: {
        bundleId: null,
        services: [catalogService('cut', '60')],
        executionMode: BookingExecutionMode.SEQUENTIAL,
      },
    });

    const result = await service.resolveBookingSelection('location-1', {
      serviceIds: ['cut'],
      startAt: '2026-11-10T10:00:00',
    });

    expect(format(result.totalPrice!)).toBe('95.50');
    expect(scheduling.resolveForBooking).toHaveBeenCalledWith(
      expect.objectContaining({ staffRule: 'CHEAPER_AND_FREER' }),
    );
  });

  it('prices an empty selection at zero', async () => {
    const { pricing, catalog, directory } = pricedSalon();
    const { service } = setup({ pricing, catalog, directory });

    const result = await service.resolveBookingSelection('location-1', {});

    expect(prices(result.availableStaff)).toEqual({
      anna: '0.00',
      boris: '0.00',
      carl: '0.00',
    });
    expect(result.totalPrice).toBeNull();
  });
});

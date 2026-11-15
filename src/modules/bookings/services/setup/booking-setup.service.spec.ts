import { BookingSetupService } from './booking-setup.service.js';

function setup(isOnlineBookingOpen: boolean) {
  const catalog = { services: [], bundles: [] };
  const location = {
    getBookingSettings: vi.fn().mockResolvedValue({ brandId: 'brand-1' }),
  };
  const billing = {
    isOnlineBookingOpen: vi.fn().mockResolvedValue(isOnlineBookingOpen),
  };
  const service = new BookingSetupService(
    { loadForBooking: vi.fn().mockResolvedValue(catalog) } as never,
    { listActiveWithServices: vi.fn().mockResolvedValue([]) } as never,
    { listForPublicCatalog: vi.fn().mockResolvedValue([]) } as never,
    location as never,
    {} as never,
    {} as never,
    billing as never,
  );
  return { service, location, billing, catalog };
}

describe('BookingSetupService.getBookingSetup', () => {
  it('reports online booking as unavailable when billing closes it', async () => {
    const { service, location, billing, catalog } = setup(false);

    const result = await service.getBookingSetup('location-1');

    expect(location.getBookingSettings).toHaveBeenCalledWith('location-1');
    expect(billing.isOnlineBookingOpen).toHaveBeenCalledWith('brand-1');
    expect(result).toEqual({
      catalog,
      staff: [],
      products: [],
      isOnlineBookingAvailable: false,
    });
  });

  it('reports online booking as available when billing keeps it open', async () => {
    const { service } = setup(true);

    await expect(service.getBookingSetup('location-1')).resolves.toMatchObject({
      isOnlineBookingAvailable: true,
    });
  });
});

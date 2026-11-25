import { AnyStaffRule } from '@prisma/client';
import { PriceBook } from '../../pricing/engine/price-book.js';
import {
  pricingSnapshot,
  pricingStaff,
  PRICING_TODAY,
} from '../../pricing/engine/testing/pricing-snapshot.factory.js';
import { BookingStaffingPreviewService } from './booking-staffing-preview.service.js';

describe('BookingStaffingPreviewService', () => {
  const staff = {
    resolveStaffForService: vi.fn(),
    resolveStaffingForServices: vi.fn(),
  };
  const calendar = { filterAvailableStaff: vi.fn() };
  const locations = { getBookingSettings: vi.fn() };
  const catalog = {
    resolveServicesForAvailability: vi.fn(),
    resolveBundleForAvailability: vi.fn(),
  };
  const staffLoad = { dayLoads: vi.fn(), lastAssignedAt: vi.fn() };
  const service = new BookingStaffingPreviewService(
    staff as never,
    calendar as never,
    locations as never,
    catalog as never,
    staffLoad as never,
  );
  const book = new PriceBook(
    pricingSnapshot({
      services: { cut: 6000, color: 9000 },
      staff: [
        pricingStaff('anna', null, { cut: 7000 }),
        pricingStaff('boris', null, { cut: 5000 }),
      ],
    }),
    PRICING_TODAY,
  );
  const request = {
    serviceIds: ['cut'],
    bundleId: null,
    staffId: null,
    date: '2026-12-04',
    time: '18:00',
    book,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    locations.getBookingSettings.mockResolvedValue({
      timezone: 'UTC',
      anyStaffRule: AnyStaffRule.CHEAPER_AND_FREER,
    });
    catalog.resolveServicesForAvailability.mockResolvedValue([
      { durationMinutes: 50, bufferMinutes: 10 },
    ]);
    staff.resolveStaffForService.mockResolvedValue([
      { id: 'anna' },
      { id: 'boris' },
    ]);
    calendar.filterAvailableStaff.mockResolvedValue([
      { id: 'anna' },
      { id: 'boris' },
    ]);
    staffLoad.dayLoads.mockResolvedValue(new Map());
    staffLoad.lastAssignedAt.mockResolvedValue(new Map());
  });

  it('assigns the free staff member the location rule ranks first, over the whole visit', async () => {
    const result = await service.preview('location', request);
    expect(result).toEqual({
      qualifiedStaffIds: ['anna', 'boris'],
      freeStaffIds: ['anna', 'boris'],
      assignedStaffId: 'boris',
    });
    const [, , date, startAt, endAt] =
      calendar.filterAvailableStaff.mock.calls[0];
    expect(date).toBe('2026-12-04');
    expect(startAt.toISOString()).toBe('2026-12-04T18:00:00.000Z');
    expect(endAt.toISOString()).toBe('2026-12-04T19:00:00.000Z');
  });

  it('ranks only the free staff and reports nobody when none is free', async () => {
    calendar.filterAvailableStaff.mockResolvedValue([{ id: 'anna' }]);
    expect((await service.preview('location', request)).assignedStaffId).toBe(
      'anna',
    );
    calendar.filterAvailableStaff.mockResolvedValue([]);
    const none = await service.preview('location', request);
    expect(none.assignedStaffId).toBeNull();
    expect(none.qualifiedStaffIds).toEqual(['anna', 'boris']);
  });

  it('keeps the staff member that was asked for, free or not', async () => {
    calendar.filterAvailableStaff.mockResolvedValue([]);
    const result = await service.preview('location', {
      ...request,
      staffId: 'anna',
    });
    expect(result.assignedStaffId).toBe('anna');
  });

  it('needs one staff member for a bundle and lasts the sum, or the longest when parallel', async () => {
    catalog.resolveServicesForAvailability.mockResolvedValue([
      { durationMinutes: 30, bufferMinutes: 0 },
      { durationMinutes: 45, bufferMinutes: 15 },
    ]);
    staff.resolveStaffingForServices.mockResolvedValue({
      coverableBySingle: [{ id: 'anna' }],
      requiresMultiple: false,
    });
    catalog.resolveBundleForAvailability.mockResolvedValue({
      executionMode: 'SEQUENTIAL',
    });
    const bundle = { ...request, serviceIds: ['cut', 'color'], bundleId: 'b' };
    await service.preview('location', bundle);
    expect(
      calendar.filterAvailableStaff.mock.calls[0][4].toISOString(),
    ).toBe('2026-12-04T19:30:00.000Z');
    catalog.resolveBundleForAvailability.mockResolvedValue({
      executionMode: 'PARALLEL',
    });
    await service.preview('location', bundle);
    expect(
      calendar.filterAvailableStaff.mock.calls[1][4].toISOString(),
    ).toBe('2026-12-04T19:00:00.000Z');
  });
});

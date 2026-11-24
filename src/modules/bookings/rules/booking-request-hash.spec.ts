import { PublicCreateBookingDto } from '../dto/public-create-booking.dto.js';
import { BookingChannel } from '../enums/booking-channel.enum.js';
import { bookingRequestHash } from './booking-request-hash.js';

const attribution = {
  channel: BookingChannel.PUBLIC_PAGE,
  bookingPageId: 'page',
  bookingWidgetId: null,
};
const request: PublicCreateBookingDto = {
  serviceIds: ['cut', 'color'],
  startAt: '2026-11-10T10:00:00',
  firstName: 'Anna',
  lastName: 'Ivanova',
  phone: '+375291112233',
  email: 'anna@example.test',
  notes: 'Note',
  expectedTotal: '110.00',
  staffAssignments: [
    { serviceId: 'cut', staffId: 'alice' },
    { serviceId: 'color', staffId: 'bob' },
  ],
};

describe('bookingRequestHash', () => {
  it('normalizes contact whitespace and assignment order without mutating the request', () => {
    expect(
      bookingRequestHash(
        'location',
        {
          ...request,
          firstName: ' Anna ',
          lastName: ' Ivanova ',
          phone: ' +375291112233 ',
          staffAssignments: [...request.staffAssignments!].reverse(),
        },
        attribution,
      ),
    ).toBe(bookingRequestHash('location', request, attribution));
    expect(request.staffAssignments![0].serviceId).toBe('cut');
  });

  it('supports the legacy single-service field and excludes the retry key', () => {
    const single = {
      ...request,
      serviceIds: ['cut'],
      staffAssignments: undefined,
    };
    expect(
      bookingRequestHash(
        'location',
        { ...single, idempotencyKey: 'key' },
        attribution,
      ),
    ).toBe(
      bookingRequestHash(
        'location',
        { ...single, serviceIds: undefined, serviceId: 'cut' },
        attribution,
      ),
    );
  });

  it('normalizes omitted optional values and an empty last name', () => {
    const minimal = {
      ...request,
      lastName: undefined,
      staffId: undefined,
      staffAssignments: undefined,
    };
    expect(bookingRequestHash('location', minimal, attribution)).toBe(
      bookingRequestHash(
        'location',
        { ...minimal, lastName: ' ', staffAssignments: [] },
        attribution,
      ),
    );
  });

  it.each<Partial<PublicCreateBookingDto>>([
    { serviceIds: ['color', 'cut'] },
    { serviceIds: ['cut'] },
    { bundleId: 'bundle' },
    { startAt: '2026-11-10T11:00:00' },
    { staffId: 'alice' },
    { staffAssignments: [{ serviceId: 'cut', staffId: 'bob' }] },
    { firstName: 'Olga' },
    { lastName: 'Petrova' },
    { phone: '+375291112234' },
    { email: 'other@example.test' },
    { notes: 'Other note' },
    { expectedTotal: '120.00' },
    { preferredStaffIds: ['alice', 'bob'] },
  ])('detects changed guest intent: %j', (patch) => {
    expect(
      bookingRequestHash('location', { ...request, ...patch }, attribution),
    ).not.toBe(bookingRequestHash('location', request, attribution));
  });

  it('keeps the order of preferred staff and treats an absent list as null', () => {
    const preferred = (preferredStaffIds?: string[]) =>
      bookingRequestHash(
        'location',
        { ...request, preferredStaffIds },
        attribution,
      );
    expect(preferred(['alice', 'bob'])).not.toBe(preferred(['bob', 'alice']));
    expect(preferred(undefined)).toBe(
      bookingRequestHash('location', request, attribution),
    );
  });

  it('scopes intent to the location and originating booking channel', () => {
    const hash = bookingRequestHash('location', request, attribution);
    expect(bookingRequestHash('other', request, attribution)).not.toBe(hash);
    expect(
      bookingRequestHash('location', request, {
        ...attribution,
        bookingPageId: 'other',
      }),
    ).not.toBe(hash);
    expect(
      bookingRequestHash('location', request, {
        channel: BookingChannel.WIDGET,
        bookingPageId: null,
        bookingWidgetId: 'widget',
      }),
    ).not.toBe(hash);
  });

  it('ignores the traffic touch: a retry may resend it changed', () => {
    const withTraffic: PublicCreateBookingDto = {
      ...request,
      traffic: { utmSource: 'ig', touchedAt: new Date() },
    };
    expect(bookingRequestHash('location', withTraffic, attribution)).toBe(
      bookingRequestHash('location', request, attribution),
    );
  });

  it('includes the promo code: it changes the price the guest agreed to', () => {
    const hash = bookingRequestHash('location', request, attribution);
    expect(
      bookingRequestHash('location', { ...request, promoCode: 'AUTUMN' }, attribution),
    ).not.toBe(hash);
  });
});

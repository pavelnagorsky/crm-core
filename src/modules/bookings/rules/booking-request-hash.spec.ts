import { CreateBookingDto } from '../dto/create-booking.dto.js';
import { BookingSource } from '../enums/booking-source.enum.js';
import { bookingRequestHash } from './booking-request-hash.js';

const attribution = {
  source: BookingSource.PUBLIC_PAGE,
  bookingPageId: 'page',
  bookingWidgetId: null,
};
const request: CreateBookingDto = {
  serviceIds: ['cut', 'color'],
  startAt: '2026-11-10T10:00:00',
  firstName: 'Anna',
  lastName: 'Ivanova',
  phone: '+375291112233',
  email: 'anna@example.test',
  notes: 'Note',
  staffAssignments: [
    { serviceId: 'cut', staffId: 'alice' },
    { serviceId: 'color', staffId: 'bob' },
  ],
};

describe('bookingRequestHash', () => {
  it('normalizes contact whitespace and assignment order without mutating the request', () => {
    expect(bookingRequestHash('location', {
      ...request,
      firstName: ' Anna ',
      lastName: ' Ivanova ',
      phone: ' +375291112233 ',
      staffAssignments: [...request.staffAssignments!].reverse(),
    }, attribution)).toBe(bookingRequestHash('location', request, attribution));
    expect(request.staffAssignments![0].serviceId).toBe('cut');
  });

  it('supports the legacy single-service field and excludes the retry key', () => {
    const single = { ...request, serviceIds: ['cut'], staffAssignments: undefined };
    expect(bookingRequestHash('location', { ...single, idempotencyKey: 'key' }, attribution))
      .toBe(bookingRequestHash('location', { ...single, serviceIds: undefined, serviceId: 'cut' }, attribution));
  });

  it('normalizes omitted optional values and an empty last name', () => {
    const minimal = { ...request, lastName: undefined, staffId: undefined, staffAssignments: undefined };
    expect(bookingRequestHash('location', minimal, attribution)).toBe(
      bookingRequestHash('location', { ...minimal, lastName: ' ', staffId: null, staffAssignments: [] }, attribution),
    );
  });

  it.each<Partial<CreateBookingDto>>([
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
  ])('detects changed guest intent: %j', (patch) => {
    expect(bookingRequestHash('location', { ...request, ...patch }, attribution))
      .not.toBe(bookingRequestHash('location', request, attribution));
  });

  it('scopes intent to the location and originating booking channel', () => {
    const hash = bookingRequestHash('location', request, attribution);
    expect(bookingRequestHash('other', request, attribution)).not.toBe(hash);
    expect(bookingRequestHash('location', request, { ...attribution, bookingPageId: 'other' })).not.toBe(hash);
    expect(bookingRequestHash('location', request, {
      source: BookingSource.WIDGET,
      bookingPageId: null,
      bookingWidgetId: 'widget',
    })).not.toBe(hash);
  });
});

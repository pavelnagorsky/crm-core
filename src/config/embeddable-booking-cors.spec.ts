import { isEmbeddableBookingPath } from './embeddable-booking-cors.js';

describe('isEmbeddableBookingPath', () => {
  it('opens the guest booking routes and leaves the authenticated client link closed', () => {
    expect(isEmbeddableBookingPath('/public/booking-widgets/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071')).toBe(true);
    expect(isEmbeddableBookingPath('/public/booking-pages/north-salon')).toBe(true);
    expect(isEmbeddableBookingPath('/public/bookings')).toBe(true);
    expect(isEmbeddableBookingPath('/public/businesses/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071/booking-setup')).toBe(true);
    expect(isEmbeddableBookingPath('/businesses/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071/calendar/public/available-slots')).toBe(true);
    expect(isEmbeddableBookingPath('/public/bookings/me')).toBe(false);
    expect(isEmbeddableBookingPath('/businesses/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071/booking-pages')).toBe(false);
  });
});

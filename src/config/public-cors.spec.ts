import { corsConfig } from './cors.config.js';
import { corsFor, isPublicApiPath } from './public-cors.js';

describe('public api cors', () => {
  it('allows any origin on guest routes and keeps the allowlist everywhere else', () => {
    expect(
      isPublicApiPath(
        '/public/businesses/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071/booking-setup',
      ),
    ).toBe(true);
    expect(
      isPublicApiPath(
        '/public/booking-widgets/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071',
      ),
    ).toBe(true);
    expect(isPublicApiPath('/public/bookings')).toBe(true);
    expect(isPublicApiPath('/public/bookings/me')).toBe(true);
    expect(
      isPublicApiPath(
        '/businesses/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071/public',
      ),
    ).toBe(true);
    expect(
      isPublicApiPath(
        '/businesses/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071/calendar/public/available-slots',
      ),
    ).toBe(true);
    expect(
      isPublicApiPath(
        '/businesses/6d9f5c3e-1c2b-4f0a-9a1b-2c3d4e5f6071/booking-pages',
      ),
    ).toBe(false);

    const open = corsFor('/public/bookings');
    expect(open.origin).toBe(true);
    expect(open.credentials).toBe(true);
    expect(corsFor('/auth/refresh')).toBe(corsConfig);
  });
});

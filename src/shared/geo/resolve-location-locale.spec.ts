import { BadRequestException } from '@nestjs/common';
import { COUNTRY_DEFAULTS } from './country-defaults.js';
import { resolveLocationLocale } from './resolve-location-locale.js';

describe('resolveLocationLocale', () => {
  it('normalizes country and currency codes without changing the input', () => {
    const input = {
      countryCode: 'by',
      currency: 'byn',
      timezone: 'Europe/Minsk',
    };

    expect(resolveLocationLocale(input)).toEqual({
      countryCode: 'BY',
      currency: 'BYN',
      timezone: 'Europe/Minsk',
    });
    expect(input.countryCode).toBe('by');
    expect(input.currency).toBe('byn');
  });

  it.each([
    { countryCode: 'ZZ', currency: 'BYN', timezone: 'Europe/Minsk' },
    { countryCode: 'BY', currency: 'USD', timezone: 'Europe/Minsk' },
    { countryCode: 'BY', currency: 'BYN', timezone: 'America/New_York' },
    { countryCode: 'BY', currency: 'BYN', timezone: 'UTC' },
  ])('rejects an unsupported combination: %j', (input) => {
    expect(() => resolveLocationLocale(input)).toThrow(BadRequestException);
  });

  it('accepts every advertised timezone, including each country default', () => {
    for (const [countryCode, defaults] of Object.entries(COUNTRY_DEFAULTS)) {
      expect(defaults.timezones).toContain(defaults.defaultTimezone);
      for (const timezone of defaults.timezones) {
        const locale = { countryCode, currency: defaults.currency, timezone };
        expect(resolveLocationLocale(locale)).toEqual(locale);
      }
    }
  });
});

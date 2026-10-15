import { BadRequestException } from '@nestjs/common';
import { COUNTRY_DEFAULTS, CountryCode } from './country-defaults.js';
import { CountryDefault } from './interfaces/country-default.interface.js';
import { LocationLocale } from './interfaces/location-locale.interface.js';

export function resolveLocationLocale(input: LocationLocale): LocationLocale {
  const countryCode = input.countryCode.toUpperCase();
  const currency = input.currency.toUpperCase();
  const country: CountryDefault | undefined = Object.hasOwn(
    COUNTRY_DEFAULTS,
    countryCode,
  )
    ? COUNTRY_DEFAULTS[countryCode as CountryCode]
    : undefined;

  if (!country) throw new BadRequestException('Unsupported country code');
  if (country.currency !== currency) {
    throw new BadRequestException('Currency does not match country default');
  }
  if (!country.timezones.includes(input.timezone)) {
    throw new BadRequestException('Timezone is not valid for country');
  }

  return { countryCode, currency, timezone: input.timezone };
}

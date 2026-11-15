import { countryDefault } from '../../../shared/geo/country-defaults.js';
import { SubscriptionOrigin } from '../interfaces/subscription-origin.interface.js';

const FALLBACK_TIMEZONE = 'Europe/Minsk';

/** Country and timezone of a brand without locations (plan section 13). */
export class BillingOrigin {
  private constructor() {}

  static fallback(defaultCountryCode: string): SubscriptionOrigin {
    return {
      countryCode: defaultCountryCode,
      timezone:
        countryDefault(defaultCountryCode)?.defaultTimezone ??
        FALLBACK_TIMEZONE,
    };
  }
}

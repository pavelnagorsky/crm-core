import { Transform } from 'class-transformer';
import {
  sanitizeTrafficValue,
  sanitizeUtmValue,
} from '../traffic/rules/traffic-sanitize.rules.js';

/**
 * Cleans a client-sent traffic value and never fails: a non-string or empty value becomes
 * undefined, control characters go, the rest is trimmed and cut to maxLength. With utm, a value
 * that holds an email or a phone-like digit run is dropped as well.
 */
export const SanitizeTrafficValue = (maxLength: number, utm = false) =>
  Transform(({ value }: { value: unknown }) =>
    utm
      ? sanitizeUtmValue(value, maxLength)
      : sanitizeTrafficValue(value, maxLength),
  );

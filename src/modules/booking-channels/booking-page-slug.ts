import regularExpressions from '../../shared/regular-expressions.js';
import { SlugAvailabilityReason } from './enums/slug-availability-reason.enum.js';

const RESERVED_BOOKING_SLUGS = new Set([
  'app',
  'auth',
  'api',
  'b',
  'public',
  'privacy-policy',
  'terms-of-service',
]);

export type SlugFormat =
  'OK' | SlugAvailabilityReason.INVALID | SlugAvailabilityReason.RESERVED;

export function classifySlug(slug: string): SlugFormat {
  if (
    slug.length === 0 ||
    slug.length > 48 ||
    !regularExpressions.bookingPageSlug.test(slug)
  ) {
    return SlugAvailabilityReason.INVALID;
  }
  if (RESERVED_BOOKING_SLUGS.has(slug)) return SlugAvailabilityReason.RESERVED;
  return 'OK';
}

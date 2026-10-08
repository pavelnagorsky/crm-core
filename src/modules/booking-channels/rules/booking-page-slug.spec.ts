import { SlugAvailabilityReason } from '../enums/slug-availability-reason.enum.js';
import { classifySlug } from './booking-page-slug.js';

describe('classifySlug', () => {
  it('accepts a lowercase hyphenated slug', () => {
    expect(classifySlug('north-salon')).toBe('OK');
    expect(classifySlug('a')).toBe('OK');
  });

  it('rejects shape that cannot be a path segment', () => {
    expect(classifySlug('')).toBe(SlugAvailabilityReason.INVALID);
    expect(classifySlug('North')).toBe(SlugAvailabilityReason.INVALID);
    expect(classifySlug('-salon')).toBe(SlugAvailabilityReason.INVALID);
    expect(classifySlug('salon-')).toBe(SlugAvailabilityReason.INVALID);
    expect(classifySlug('salon--2')).toBe(SlugAvailabilityReason.INVALID);
    expect(classifySlug('a'.repeat(49))).toBe(SlugAvailabilityReason.INVALID);
  });

  it('reserves real app path segments', () => {
    expect(classifySlug('app')).toBe(SlugAvailabilityReason.RESERVED);
    expect(classifySlug('auth')).toBe(SlugAvailabilityReason.RESERVED);
    expect(classifySlug('b')).toBe(SlugAvailabilityReason.RESERVED);
    expect(classifySlug('privacy-policy')).toBe(
      SlugAvailabilityReason.RESERVED,
    );
    expect(classifySlug('terms-of-service')).toBe(
      SlugAvailabilityReason.RESERVED,
    );
  });
});

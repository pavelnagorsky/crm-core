import { PhoneSearchPatterns } from '../interfaces/phone-search-patterns.interface.js';
import regularExpressions from '../regular-expressions.js';

/** Country codes whose national numbers are typed without the code, ranked as prefixes too. */
const NATIONAL_COUNTRY_CODES = ['375', '7'] as const;

/** Fewest digits that identify a number; fewer would match nearly every client. */
export const PHONE_SEARCH_MIN_DIGITS = 3;

/**
 * Turns typed phone digits into matches against stored E.164 phones.
 * Mirrors canonicalPhone for partial input: "00…" is the international prefix, "80…" and a
 * single leading "0" are Belarus (+375), any other leading "8" is Russia (+7).
 */
export function phoneSearchPatterns(digits: string): PhoneSearchPatterns {
  const trunk = trunkReplacement(digits);
  const trunkPrefixes = trunk ? [`+${trunk.country}${trunk.national}`] : [];
  return {
    significant: trunk?.national ?? digits,
    contains: digits,
    trunkPrefixes,
    rankPrefixes: [
      ...new Set([
        `+${digits}`,
        ...trunkPrefixes,
        ...NATIONAL_COUNTRY_CODES.map((code) => `+${code}${digits}`),
      ]),
    ],
  };
}

function trunkReplacement(
  digits: string,
): { country: string; national: string } | null {
  if (digits.startsWith('00'))
    return { country: '', national: digits.slice(2) };
  if (digits.startsWith('80'))
    return { country: '375', national: digits.slice(2) };
  if (digits.startsWith('0'))
    return { country: '375', national: digits.slice(1) };
  if (digits.startsWith('8'))
    return { country: '7', national: digits.slice(1) };
  return null;
}

/** Whether typed digits are specific enough to search phones by. */
export function isPhoneSearchable(digits: string): boolean {
  return (
    regularExpressions.phoneSearchDigits.test(digits) &&
    phoneSearchPatterns(digits).significant.length >= PHONE_SEARCH_MIN_DIGITS
  );
}

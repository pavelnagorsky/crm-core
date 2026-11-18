import { PhoneSearchPatterns } from '../interfaces/phone-search-patterns.interface.js';

/** Country codes whose national numbers are typed without the code, ranked as prefixes too. */
const NATIONAL_COUNTRY_CODES = ['375', '7'] as const;

/**
 * Turns typed phone digits into matches against stored E.164 phones.
 * Mirrors canonicalPhone for partial input: "80…" is Belarus (+375), any other leading
 * "8" is Russia (+7) and "00" is the international prefix.
 */
export function phoneSearchPatterns(digits: string): PhoneSearchPatterns {
  const trunk = trunkReplacement(digits);
  const trunkPrefixes = trunk ? [`+${trunk}`] : [];
  return {
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

function trunkReplacement(digits: string): string | null {
  if (digits.startsWith('00')) return digits.slice(2) || null;
  if (digits.startsWith('80')) return `375${digits.slice(2)}`;
  if (digits.startsWith('8')) return `7${digits.slice(1)}`;
  return null;
}

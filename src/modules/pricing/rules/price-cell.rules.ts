import { SERVICE_PRICE_MAX_UNITS } from '../constants/service-price-import.constants.js';

/** Spaces and non-breaking spaces. */
const SPACES = /[\s ]+/g;
const PRICE_TEXT = /^\d+(\.\d+)?$/;
const NOISE = 1e-6;

/**
 * A price cell of a price file (services and products): `55`, `55.5`, `55,50`, `1 200`. Null for
 * an empty cell, undefined for text that is not a price (not a number, negative, over two
 * decimals, over the maximum). Binary noise of a spreadsheet number (55.00000000000001) is
 * rounded away.
 */
export function parsePriceCell(text: string): string | null | undefined {
  const cleaned = text.replace(SPACES, '').replace(',', '.');
  if (cleaned === '') return null;
  if (!PRICE_TEXT.test(cleaned)) return undefined;
  const [units, fraction = ''] = cleaned.split('.');
  let canonicalUnits = units.replace(/^0+(?=\d)/, '');
  let canonicalFraction = fraction;
  if (fraction.length > 2) {
    const scaled = Number(cleaned) * 100;
    if (Math.abs(scaled - Math.round(scaled)) > NOISE) return undefined;
    const rounded = (Math.round(scaled) / 100).toFixed(2);
    [canonicalUnits, canonicalFraction] = rounded.split('.');
  }
  if (Number(canonicalUnits) > SERVICE_PRICE_MAX_UNITS) return undefined;
  return `${canonicalUnits}.${canonicalFraction.padEnd(2, '0')}`;
}

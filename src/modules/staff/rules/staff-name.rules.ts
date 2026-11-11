import regularExpressions from '../../../shared/regular-expressions.js';

/** Comparison key for a staff name typed by hand: case, `ё` and extra spaces do not matter. */
export function normalizeStaffName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(new RegExp(regularExpressions.whitespace, 'g'), ' ');
}

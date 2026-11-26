import { format, isValid, parse } from 'date-fns';
import regularExpressions from '../../../shared/regular-expressions.js';
import { assertPriceChangeDate } from './service-price-change-spec.rules.js';

/**
 * The effective date field of a price upload form: empty is now (null); otherwise a real
 * YYYY-MM-DD later than the location today and within two years, else 400
 * PRICE_CHANGE_DATE_INVALID.
 */
export function parseImportEffectiveDate(
  raw: string | undefined,
  today: string,
): string | null {
  const effectiveDate = raw?.trim() || null;
  if (effectiveDate === null) return null;
  const parsed = parse(effectiveDate, 'yyyy-MM-dd', new Date());
  const valid =
    regularExpressions.calendarDate.test(effectiveDate) &&
    isValid(parsed) &&
    format(parsed, 'yyyy-MM-dd') === effectiveDate;
  assertPriceChangeDate(valid ? effectiveDate : '0000-00-00', today);
  return effectiveDate;
}

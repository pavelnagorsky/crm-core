import { Transform } from 'class-transformer';
import regularExpressions from '../regular-expressions.js';

/**
 * Keeps only the digits of a string, so "+375 (29) 233-20" becomes "3752923320".
 * A blank value counts as not sent.
 */
export const DigitsOnly = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    if (!value.trim()) return undefined;
    return value.replace(regularExpressions.nonDigit, '');
  });

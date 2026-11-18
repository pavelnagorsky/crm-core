import { Transform } from 'class-transformer';
import regularExpressions from '../regular-expressions.js';

/** Keeps only the digits of a string, so "+375 (29) 233-20" becomes "3752923320". */
export const DigitsOnly = () =>
  Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(regularExpressions.nonDigit, '')
      : value,
  );

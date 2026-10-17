import { Transform } from 'class-transformer';
import { MoneyUtils } from '../money/money.utils.js';

/** Pads a numeric input to 2 decimal places. A longer fraction is left intact for validation. */
export const CanonicalAmount = () =>
  Transform(({ value }) => MoneyUtils.canonical(value));

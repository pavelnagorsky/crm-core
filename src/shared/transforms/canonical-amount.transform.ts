import { Transform } from 'class-transformer';
import { MoneyService } from '../money/money.service.js';

/** Pads a numeric input to 2 decimal places. A longer fraction is left intact for validation. */
export const CanonicalAmount = () =>
  Transform(({ value }) => MoneyService.canonical(value));

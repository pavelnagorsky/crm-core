import { Prisma } from '@prisma/client';
import { DraftRepricingOptions } from './draft-repricing-options.interface.js';

/**
 * Price check of a confirmation: the confirmed lines are priced again with fresh data and
 * must add up to what the user saw, else 409 PRICE_CHANGED.
 */
export interface ConfirmationPricing extends Omit<
  DraftRepricingOptions,
  'consistency'
> {
  /** Σ lineTotal of the confirmed lines the user saw. */
  expectedTotal: Prisma.Decimal;
}

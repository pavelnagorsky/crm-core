import { DiscountCandidate } from './discount-candidate.interface.js';

/** The discount a line gets: the chosen candidate and its share of it (a FIXED bundle splits one). */
export interface LineDiscount {
  candidate: DiscountCandidate;
  /** Positive, minor units. */
  amount: number;
}

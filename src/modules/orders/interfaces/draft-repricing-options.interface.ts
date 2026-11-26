import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';

/** How the draft product lines of an order are priced again. */
export interface DraftRepricingOptions {
  /** CACHED for a draft write, FRESH for a confirmation. */
  consistency?: ReadConsistency;
  /** Choices sent in this request, by product id (null = AUTO); checked strictly. */
  explicit?: ReadonlyMap<string, LineDiscountChoice | null>;
  /** Index of each product in the request, for PROMOTION_NOT_APPLICABLE. */
  lineIndexOf?: ReadonlyMap<string, number>;
  /** Sale moment of an immediate sale; drafts are sold now. */
  saleAt?: Date;
}

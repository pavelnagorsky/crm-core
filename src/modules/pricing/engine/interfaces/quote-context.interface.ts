import { PromotionChannel } from '../enums/promotion-channel.enum.js';
import { LineDiscountChoice } from './line-discount-choice.interface.js';
import { PromotionUsage } from './promotion-usage.interface.js';
import { QuoteClient } from './quote-client.interface.js';

/**
 * Who books, where and when: what promotions and the client discount need. The caller
 * reads the clock and the client; the engine stays pure.
 */
export interface QuoteContext {
  channel: PromotionChannel;
  /** Moment of pricing, UTC ms. */
  nowMs: number;
  /** The location "today" at nowMs, YYYY-MM-DD. */
  today: string;
  /** Visit start, UTC ms; null = not known (lead time conditions do not hold). */
  visitStartMs: number | null;
  client: QuoteClient;
  /** As entered; compared case-insensitively. */
  promoCode: string | null;
  /** By rule id, only for promotions with limits; missing = 0. */
  usage: Record<string, PromotionUsage>;
  /** By line index; missing = AUTO. A FIXED bundle uses the first choice given. */
  choice?: Record<number, LineDiscountChoice>;
  /**
   * Catalog "from" prices: only promotions every online client gets, so conditions on the
   * lead time and the visit total do not hold.
   */
  catalogFloor?: boolean;
}

import { Prisma } from '@prisma/client';
import { QuoteContext } from '../engine/interfaces/quote-context.interface.js';
import { VisitTime } from '../engine/interfaces/visit-time.interface.js';
import { ProductPriceLineRequest } from './product-price-line-request.interface.js';

/** Product lines of one visit order or sale (docs/pricing-stage7-api.md, "Контекст строки"). */
export interface ProductPriceRequest {
  lines: ProductPriceLineRequest[];
  /** Visit start or sale moment, local; the retail price is taken on time.date. */
  time: VisitTime;
  /** Null: no discounts. visitStartMs = null: a sale (lead time conditions give NO_VISIT). */
  context: QuoteContext | null;
  /** List total of the other lines of the visit or sale: booking services, confirmed products. */
  otherListTotal: Prisma.Decimal;
}

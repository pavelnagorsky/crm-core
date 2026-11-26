import { Prisma } from '@prisma/client';
import { PromoCodeResult } from '../engine/interfaces/promo-code-result.interface.js';
import { PriceExplainKind } from '../enums/price-explain-kind.enum.js';
import { PriceExplainCandidate } from './price-explain-candidate.interface.js';
import { PriceExplainLine } from './price-explain-line.interface.js';
import { PriceExplainNotApplied } from './price-explain-not-applied.interface.js';

/** Why a visit or a product line costs what it costs at a given time. */
export interface PriceExplain {
  kind: PriceExplainKind;
  /** The staff member priced (a product: the seller); null when "any staff" found nobody free. */
  staffId: string | null;
  staffName: string | null;
  levelName: string | null;
  total: number;
  line: PriceExplainLine;
  candidates: PriceExplainCandidate[];
  notApplied: PriceExplainNotApplied[];
  /** Null without a promo code. */
  promoCode: PromoCodeResult | null;
  /** Product: last purchase cost of one unit, only with Read(INVENTORY); null otherwise. */
  lastPurchaseUnitCost: Prisma.Decimal | null;
  /** Product: the line total is below the last purchase cost of the quantity. */
  belowCost: boolean;
}

import { PriceExplainCandidate } from './price-explain-candidate.interface.js';
import { PriceExplainLine } from './price-explain-line.interface.js';
import { PriceExplainNotApplied } from './price-explain-not-applied.interface.js';

/** Why a visit costs what it costs at a given time. */
export interface PriceExplain {
  /** The staff member priced; null when "any staff" found nobody free. */
  staffId: string | null;
  staffName: string | null;
  levelName: string | null;
  total: number;
  line: PriceExplainLine;
  candidates: PriceExplainCandidate[];
  notApplied: PriceExplainNotApplied[];
}

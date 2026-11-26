import { PriceChange } from '@prisma/client';

/** A stored change with the name of its author (null: the user is gone). */
export interface PriceChangeSummaryView {
  change: PriceChange;
  createdBy: { id: string; name: string } | null;
}

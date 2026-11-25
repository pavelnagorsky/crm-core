import { ServicePriceChange } from '@prisma/client';

/** A stored change with the name of its author (null: the user is gone). */
export interface ServicePriceChangeSummaryView {
  change: ServicePriceChange;
  createdBy: { id: string; name: string } | null;
}

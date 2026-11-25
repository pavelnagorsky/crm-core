import { ServicePriceChangeSkip } from '@prisma/client';

/** The target of a row as it is stored now. */
export interface PriceChangeTargetState {
  /** Why the row cannot be written, if so. */
  skip: ServicePriceChangeSkip | null;
  /** Stored price in minor units; null: no level price / personal price. */
  current: number | null;
}

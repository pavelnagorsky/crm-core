import { PriceChangeTarget } from '@prisma/client';

/** One price of a preview, minor units. */
export interface PriceChangeRow {
  /** BASE:<serviceId> | LEVEL:<serviceId>:<levelId> | STAFF:<serviceId>:<staffId> | BUNDLE:<bundleId> */
  key: string;
  targetType: PriceChangeTarget;
  levelId: string | null;
  levelName: string | null;
  staffId: string | null;
  staffName: string | null;
  /** Null only for a level or personal price that did not exist. */
  before: number | null;
  /** Null only for a level or personal price to remove. */
  after: number | null;
  invalid: boolean;
  checked: boolean;
  /** File upload: date of the scheduled change that set "before" and that the new price replaces. */
  replacesScheduledDate: string | null;
}

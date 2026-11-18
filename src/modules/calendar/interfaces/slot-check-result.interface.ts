import { SlotConflictReason } from '../enums/slot-conflict-reason.enum.js';

/** Whether a manual visit fits at the requested start, and the first obstacle when it does not. */
export interface SlotCheckResult {
  available: boolean;
  reason: SlotConflictReason | null;
  staffId: string | null;
  /** Local wall time in the location zone, YYYY-MM-DDTHH:mm:ss. */
  conflictStart: string | null;
  conflictEnd: string | null;
  /** The visit interval, local wall time. */
  startAt: string;
  endAt: string;
}

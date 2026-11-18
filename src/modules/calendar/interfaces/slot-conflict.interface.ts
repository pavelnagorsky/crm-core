import { SlotConflictReason } from '../enums/slot-conflict-reason.enum.js';

/** An obstacle on the visit day, in minutes from local midnight (end may be 1440). */
export interface SlotConflict {
  reason: SlotConflictReason;
  start: number;
  end: number;
}

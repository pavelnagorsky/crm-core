/** A free slot start with, for each item of the visit, the candidate staff who are free for it. */
export interface CalendarSlotStart {
  /** Minutes from local midnight. */
  minute: number;
  /** Free candidate staff ids per item, in item order. */
  freeStaffIds: string[][];
}

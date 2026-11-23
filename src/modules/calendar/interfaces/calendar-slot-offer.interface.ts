/** A bookable slot start and who is free for each item there. The calendar knows no prices. */
export interface CalendarSlotOffer {
  /** HH:mm in the location timezone. */
  time: string;
  /** Free candidate staff ids per item, in item order. */
  freeStaffIds: string[][];
}

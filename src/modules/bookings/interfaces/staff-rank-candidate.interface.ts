/** A staff member who can take a booking item, with what "any staff" ranking compares. */
export interface StaffRankCandidate {
  id: string;
  /** Busy or off shift; only offered with allowConflicts. */
  busy: boolean;
  /** Price this staff member gives the item, minor units (PriceBook.candidatePrice). */
  price: number;
  /** Booking items of the staff member that day. */
  dayLoad: number;
  /** When the staff member last got a booking (epoch ms); null: never. */
  lastAssignedAt: number | null;
}

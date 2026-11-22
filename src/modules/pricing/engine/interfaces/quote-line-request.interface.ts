/** One service line to price. Money is in integer minor units. */
export interface QuoteLineRequest {
  serviceId: string;
  /** Assigned staff member; null when not chosen yet (preview). */
  staffId: string | null;
  /** Price set by an administrator; replaces the total, the layers stay as history. */
  customPrice: number | null;
}

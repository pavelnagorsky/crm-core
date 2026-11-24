/** A client who has not booked again since a promotion visit. */
export interface PromotionNotReturnedClient {
  clientId: string;
  name: string;
  phone: string | null;
  /** Start of the last completed visit with the promotion. */
  lastPromotionVisit: Date;
}

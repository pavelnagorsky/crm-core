/** Live bookings that already used a promotion with a limit. */
export interface PromotionUsage {
  total: number;
  /** Of this client, within the limit period of the promotion. */
  perClient: number;
}

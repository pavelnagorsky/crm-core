export interface PaymentMoneyRange {
  locationId: string;
  /** Inclusive UTC start. */
  from: Date;
  /** Exclusive UTC end. */
  to: Date;
}

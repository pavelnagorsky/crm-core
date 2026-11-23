/** A staff member who performs the service and what they would charge at the time. */
export interface PriceExplainCandidate {
  staffId: string;
  name: string;
  levelName: string | null;
  /** Has a personal price for the service (every line of a bundle). */
  personal: boolean;
  price: number;
  /** Free for the whole visit at that time. */
  available: boolean;
}

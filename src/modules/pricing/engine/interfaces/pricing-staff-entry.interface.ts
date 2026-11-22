/** Active staff member as the engine prices it. Money is in integer minor units. */
export interface PricingStaffEntry {
  id: string;
  name: string;
  /** Null: the default level (base prices). */
  levelId: string | null;
  /** Personal price by service id; wins over the level price. */
  servicePrices: Record<string, number>;
}

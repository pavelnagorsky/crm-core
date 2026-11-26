/** Who asks for a booking price preview. */
export interface BookingPricingAccess {
  /** A cabinet user who may book: channel ADMIN, clientId, discount choices and menus. */
  cabinet: boolean;
  /** Purchase prices of products as numbers: Read(INVENTORY). */
  canReadPurchaseCost?: boolean;
  /** Staff profile of a booking.own user: ranked first for "any staff" lines, as on creation. */
  ownStaffId?: string;
}

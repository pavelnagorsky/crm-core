/** Who asks for a booking price preview. */
export interface BookingPricingAccess {
  /** A cabinet user who may book: channel ADMIN, clientId, discount choices and menus. */
  cabinet: boolean;
}

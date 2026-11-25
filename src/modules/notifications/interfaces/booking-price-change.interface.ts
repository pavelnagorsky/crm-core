/** A move changed what the client pays for the services: both totals as shown, "60.00 BYN". */
export interface BookingPriceChange {
  price: string;
  previousPrice: string;
}

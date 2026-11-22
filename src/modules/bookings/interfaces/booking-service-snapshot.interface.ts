/** Service of a booking selection; its price comes from PricingFacade. */
export interface BookingServiceSnapshot {
  id: string;
  title: string;
  durationMinutes: number;
  bufferMinutes: number;
}

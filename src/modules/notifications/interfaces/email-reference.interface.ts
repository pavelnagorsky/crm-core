/** What an email is about: lets the delivery log filter by business and cancel a booking's pending emails. */
export interface EmailReference {
  brandId?: string | null;
  locationId?: string | null;
  bookingId?: string | null;
  /** After this moment the email is pointless and is not sent. */
  validUntil?: Date | null;
}

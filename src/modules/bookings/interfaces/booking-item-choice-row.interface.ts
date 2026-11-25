import { BookingItemDiscountChoice } from './booking-item-discount-choice.interface.js';

/** A booking item's service and stored discount pick, as the booking dialog preview reads it. */
export interface BookingItemChoiceRow extends BookingItemDiscountChoice {
  serviceId: string;
}

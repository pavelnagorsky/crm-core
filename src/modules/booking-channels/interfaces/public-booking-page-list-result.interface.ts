import { PublicBookingPageListEntry } from './public-booking-page-list-entry.interface.js';

export interface PublicBookingPageListResult {
  items: PublicBookingPageListEntry[];
  totalItems: number;
}

import { CalendarSlotOffer } from './calendar-slot-offer.interface.js';

export interface CalendarSlotOffersDay {
  /** YYYY-MM-DD in the location timezone. */
  date: string;
  slots: CalendarSlotOffer[];
}

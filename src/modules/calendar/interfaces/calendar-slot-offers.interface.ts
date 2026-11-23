import { CalendarSlotItem } from './calendar-slot-item.interface.js';
import { CalendarSlotOffersDay } from './calendar-slot-offers-day.interface.js';

/**
 * Public slots of a selection with the free candidate staff of every item. Whoever prices
 * the slots picks the staff from these lists (the calendar module does not know prices).
 */
export interface CalendarSlotOffers {
  /** Visit items in booking order; `freeStaffIds` of a slot follows this order. */
  items: CalendarSlotItem[];
  executionMode: string;
  days: CalendarSlotOffersDay[];
}

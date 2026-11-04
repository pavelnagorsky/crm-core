import { BookingWidgetPlacement } from '../enums/booking-widget-placement.enum.js';
import { BookingWidgetTrigger } from '../enums/booking-widget-trigger.enum.js';

export function normalizeBookingWidgetTrigger(
  placement: BookingWidgetPlacement,
  trigger: BookingWidgetTrigger,
): BookingWidgetTrigger {
  return placement === BookingWidgetPlacement.INLINE
    ? BookingWidgetTrigger.INLINE_BUTTON
    : trigger;
}

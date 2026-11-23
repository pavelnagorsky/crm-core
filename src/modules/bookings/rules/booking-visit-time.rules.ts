import { TimeUtils } from '../../../shared/time/time.utils.js';
import { VisitTime } from '../../pricing/engine/interfaces/visit-time.interface.js';
import { ClientBookingWindow } from '../interfaces/client-booking-window.interface.js';

/**
 * Local start of a visit that begins at this instant: surcharges look at the date and the
 * minute of the earliest item in the location time zone (docs/pricing-stage3-api.md).
 */
export function visitTimeAt(startAt: Date, timezone: string): VisitTime {
  return {
    date: TimeUtils.zonedDateStr(startAt, timezone),
    minute: TimeUtils.dateToMinutes(startAt, timezone),
  };
}

/** Visit start of a public slot: its local day and HH:mm, already in the location zone. */
export function visitTimeOfSlot(date: string, time: string): VisitTime {
  return { date, minute: TimeUtils.hhmmToMinutes(time) };
}

/**
 * Local dates a client can book online: the location's today and the following days of the
 * advance window, the same days the public slots offer. "From - to" prices span them.
 */
export function onlineBookingDates(
  location: Pick<ClientBookingWindow, 'timezone' | 'advanceBookingWindowDays'>,
  now: Date = new Date(),
): string[] {
  const today = TimeUtils.zonedDateStr(now, location.timezone);
  return TimeUtils.enumerateDates(
    today,
    TimeUtils.addDaysStr(
      today,
      Math.max(location.advanceBookingWindowDays, 1) - 1,
    ),
  );
}

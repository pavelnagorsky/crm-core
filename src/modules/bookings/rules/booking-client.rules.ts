import { HttpStatus } from '@nestjs/common';
import { Booking } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ClientBookingWindow } from '../interfaces/client-booking-window.interface.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CLIENT_ACCESS_DAYS = 3;
/** Completed visits stay reachable longer so the client can leave and edit a review. */
const CLIENT_COMPLETED_ACCESS_DAYS = 14;

export function clientAccessExpiresAt(
  booking: Pick<Booking, 'endAt' | 'status'>,
): Date {
  const days =
    booking.status === BookingStatus.COMPLETED
      ? CLIENT_COMPLETED_ACCESS_DAYS
      : CLIENT_ACCESS_DAYS;
  return new Date(booking.endAt.getTime() + days * DAY_MS);
}

export function resolveClientRescheduleStart(
  localStart: string,
  timezone: string,
): Date {
  const startAt = TimeUtils.localToUtc(localStart, timezone);
  const parts = TimeUtils.toZonedParts(startAt, timezone);
  const time = [parts.hour, parts.minute, parts.second]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  if (`${TimeUtils.zonedDateStr(startAt, timezone)}T${time}` !== localStart)
    throw new AppException(
      ErrorCode.BOOKING_SLOT_UNAVAILABLE,
      HttpStatus.CONFLICT,
    );
  return startAt;
}

export function canClientManageBooking(
  booking: Pick<Booking, 'status' | 'startAt'>,
  now = new Date(),
): boolean {
  return (
    (booking.status === BookingStatus.PENDING ||
      booking.status === BookingStatus.CONFIRMED) &&
    booking.startAt > now
  );
}

export function assertClientCanManageBooking(
  booking: Pick<Booking, 'status' | 'startAt'>,
): void {
  if (!canClientManageBooking(booking))
    throw new AppException(
      ErrorCode.BOOKING_CLIENT_ACTION_UNAVAILABLE,
      HttpStatus.FORBIDDEN,
    );
}

export function assertClientRescheduleTime(
  startAt: Date,
  location: ClientBookingWindow,
  now = new Date(),
): void {
  const date = TimeUtils.zonedDateStr(startAt, location.timezone);
  const last = TimeUtils.addDaysStr(
    TimeUtils.zonedDateStr(now, location.timezone),
    location.advanceBookingWindowDays - 1,
  );
  if (
    startAt <= now ||
    startAt.getTime() <
      now.getTime() + location.minimumBookingNoticeMinutes * 60_000 ||
    date > last ||
    startAt.getUTCSeconds() !== 0 ||
    startAt.getUTCMilliseconds() !== 0 ||
    TimeUtils.dateToMinutes(startAt, location.timezone) %
      location.slotIntervalMinutes !==
      0
  ) {
    throw new AppException(
      ErrorCode.BOOKING_SLOT_UNAVAILABLE,
      HttpStatus.CONFLICT,
    );
  }
}

import { Booking, ClientNoticeType } from '@prisma/client';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { ClientNoticeBooking } from '../interfaces/client-notice-booking.interface.js';
import { ClientNoticeState } from '../interfaces/client-notice-state.interface.js';
import { ACTIVE_BOOKING_STATUSES } from './booking-cron.rules.js';

/** Lets staff undo a mistaken change, or finish a series of moves, before the client hears of it. */
export const CLIENT_NOTICE_DELAY_MS = 2 * 60 * 1000;

export const NO_CLIENT_NOTICE: ClientNoticeState = {
  clientNoticeAt: null,
  clientNoticeType: null,
  clientNoticeFromStartAt: null,
};

/** Whether the client can still use an email about this booking: it is ahead and still on. */
function canReachClient(
  booking: Pick<Booking, 'status' | 'startAt' | 'clientEmail'>,
  now: Date,
): boolean {
  return (
    Boolean(booking.clientEmail) &&
    ACTIVE_BOOKING_STATUSES.includes(booking.status as BookingStatus) &&
    booking.startAt.getTime() > now.getTime()
  );
}

/** The confirmation email for a booking staff just created. */
export function createdClientNotice(
  booking: Omit<ClientNoticeBooking, keyof ClientNoticeState>,
  now: Date,
): ClientNoticeState {
  if (!booking.notifyClient || !canReachClient(booking, now))
    return NO_CLIENT_NOTICE;
  return {
    clientNoticeAt: new Date(now.getTime() + CLIENT_NOTICE_DELAY_MS),
    clientNoticeType: ClientNoticeType.CREATED,
    clientNoticeFromStartAt: null,
  };
}

/**
 * The pending email after staff moved the booking. A pending creation email absorbs the move
 * and goes out later with the final time. A series of moves sends one email from the first
 * start, and moving back to it sends nothing.
 */
export function staffRescheduleClientNotice(
  old: ClientNoticeBooking,
  next: Pick<Booking, 'startAt' | 'clientEmail'>,
  notifyOnStaffChanges: boolean,
  now: Date,
): ClientNoticeState {
  const sendAt = new Date(now.getTime() + CLIENT_NOTICE_DELAY_MS);
  if (old.clientNoticeType === ClientNoticeType.CREATED)
    return { ...pendingState(old), clientNoticeAt: sendAt };
  if (next.startAt.getTime() === old.startAt.getTime())
    return pendingState(old);
  const fromStartAt = old.clientNoticeFromStartAt ?? old.startAt;
  if (
    !notifyOnStaffChanges ||
    !old.notifyClient ||
    !canReachClient({ ...old, ...next }, now) ||
    next.startAt.getTime() === fromStartAt.getTime()
  )
    return NO_CLIENT_NOTICE;
  return {
    clientNoticeAt: sendAt,
    clientNoticeType: ClientNoticeType.RESCHEDULED,
    clientNoticeFromStartAt: fromStartAt,
  };
}

/** The client moved the booking and is told at once, so a pending staff move email is dropped. */
export function clientRescheduleClientNotice(
  old: ClientNoticeState,
): ClientNoticeState {
  return old.clientNoticeType === ClientNoticeType.RESCHEDULED
    ? NO_CLIENT_NOTICE
    : pendingState(old);
}

/** Rechecked when the cron sends: the booking may have changed since the email was queued. */
export function isClientNoticeSendable(
  booking: ClientNoticeBooking,
  notifyOnStaffChanges: boolean,
  now: Date,
): boolean {
  if (!booking.notifyClient || !canReachClient(booking, now)) return false;
  if (booking.clientNoticeType === ClientNoticeType.CREATED) return true;
  return (
    booking.clientNoticeType === ClientNoticeType.RESCHEDULED &&
    notifyOnStaffChanges &&
    booking.clientNoticeFromStartAt !== null &&
    booking.clientNoticeFromStartAt.getTime() !== booking.startAt.getTime()
  );
}

function pendingState(booking: ClientNoticeState): ClientNoticeState {
  return {
    clientNoticeAt: booking.clientNoticeAt,
    clientNoticeType: booking.clientNoticeType,
    clientNoticeFromStartAt: booking.clientNoticeFromStartAt,
  };
}

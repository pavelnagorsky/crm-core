import { Booking } from '@prisma/client';
import { ClientNoticeState } from './client-notice-state.interface.js';

/** What the client-notice rules read from a booking. */
export type ClientNoticeBooking = Pick<
  Booking,
  'status' | 'startAt' | 'clientEmail' | 'notifyClient'
> &
  ClientNoticeState;

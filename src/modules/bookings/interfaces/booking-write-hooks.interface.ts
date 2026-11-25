import { Prisma } from '@prisma/client';
import { BookingWithItems } from './booking-with-items.interface.js';

/** Steps another write adds to a booking update transaction. */
export interface BookingWriteHooks {
  /**
   * Before the transaction, with the items at their final staff and time (after a move):
   * more booking data to write, such as prices of the new time.
   */
  prepare?: (
    items: BookingWithItems['items'],
  ) => Promise<Prisma.BookingUpdateInput>;
  /** First step of the transaction, before the booking lock (a payment key lock). */
  beforeLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  /** After the booking is saved and a completed visit is synced to its order. */
  afterUpdate?: (
    updated: BookingWithItems,
    tx: Prisma.TransactionClient,
  ) => Promise<void>;
}

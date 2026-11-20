import { Prisma } from '@prisma/client';
import { BookingWithItems } from './booking-with-items.interface.js';

/** Steps another write adds to a booking update transaction. */
export interface BookingWriteHooks {
  /** First step of the transaction, before the booking lock (a payment key lock). */
  beforeLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  /** After the booking is saved and a completed visit is synced to its order. */
  afterUpdate?: (
    updated: BookingWithItems,
    tx: Prisma.TransactionClient,
  ) => Promise<void>;
}

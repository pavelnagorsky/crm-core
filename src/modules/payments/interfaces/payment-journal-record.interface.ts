import { Payment } from '@prisma/client';

/** The part of a journal record that the sums read. */
export type PaymentJournalRecord = Pick<
  Payment,
  'type' | 'method' | 'amount' | 'voidedAt'
>;

import { Prisma } from '@prisma/client';
import { NotSpecifiedRow } from './not-specified-row.interface.js';

export interface NotSpecifiedResult {
  /** The first rows by time. */
  items: NotSpecifiedRow[];
  /** All rows. */
  count: number;
  /** Amount due of all rows. */
  amount: Prisma.Decimal;
}

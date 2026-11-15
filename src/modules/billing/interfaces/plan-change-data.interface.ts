import { Subscription } from '@prisma/client';

/** New plan terms; paidUntil is null when the paid period stays as it is. */
export interface PlanChangeData extends Partial<Subscription> {
  planId: string;
  paidUntil: Date | null;
}

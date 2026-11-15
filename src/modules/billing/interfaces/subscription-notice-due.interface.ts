import { SubscriptionNoticeKind } from '@prisma/client';

export interface SubscriptionNoticeDue {
  kind: SubscriptionNoticeKind;
  /** accessEndsAt, or graceEndsAt for ACCESS_LIMITED. Part of the idempotency key. */
  anchorAt: Date;
  /** 0 for ACCESS_ENDED and ACCESS_LIMITED. */
  daysBefore: number;
}

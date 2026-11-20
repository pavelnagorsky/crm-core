import { BillingPeriod } from '@prisma/client';

/** Data of the platform billing emails (plan section 9.4). Absent fields hide their rows. */
export interface SubscriptionEmailData {
  brandId: string;
  brandName: string;
  recipientFirstName: string | null;
  /** Subscription timezone: dates are shown as its local days. */
  timezone: string;
  actionLink: string;
  /** Text variant of the template, e.g. PENDING when a payment request is open. */
  variant?: string;
  daysLeft?: number | null;
  planName?: string | null;
  /** The plan is a suggestion for the trial end, not the current one. */
  suggestedPlan?: boolean;
  billingPeriod?: BillingPeriod | null;
  /** "39.00 BYN". */
  amount?: string | null;
  /** "KL-000123". */
  paymentNumber?: string | null;
  expiresAt?: Date | null;
  /** A moment within the last day with access. */
  lastDay?: Date | null;
  /** A moment within the last day of the grace period. */
  graceLastDay?: Date | null;
  instructions?: string | null;
  comment?: string | null;
  ownerEmail?: string | null;
}

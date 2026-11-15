import { BillingSettings } from '@prisma/client';

export interface PaymentStartContext {
  settings: BillingSettings;
  /** Where an online provider returns the owner after paying. */
  returnUrl: string;
}

import { SubscriptionPayment } from '@prisma/client';

export interface AdminPaymentWithBrand {
  payment: SubscriptionPayment;
  brandName: string | null;
}

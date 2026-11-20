import { Prisma, SubscriptionPayment } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { SubscriptionEmailData } from '../../notifications/interfaces/subscription-email-data.interface.js';
import { PaymentReference } from '../compute/payment-reference.js';

/** How billing values look in emails. */
export class BillingEmailFormat {
  private constructor() {}

  static payment(
    payment: SubscriptionPayment,
    brandName: string,
    timezone: string,
    actionLink: string,
  ): SubscriptionEmailData {
    return {
      brandId: payment.brandId,
      brandName,
      recipientFirstName: null,
      timezone,
      actionLink,
      paymentNumber: PaymentReference.format(payment.number),
      planName: payment.planName,
      billingPeriod: payment.billingPeriod,
      amount: BillingEmailFormat.money(payment.amount, payment.currency),
    };
  }

  static money(amount: Prisma.Decimal, currency: string): string {
    return `${MoneyUtils.format(amount)} ${currency}`;
  }

  /** A moment inside the last day before an exclusive end. */
  static lastMoment(end: Date): Date {
    return new Date(end.getTime() - 1);
  }
}

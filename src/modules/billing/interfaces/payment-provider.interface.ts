import {
  SubscriptionPayment,
  SubscriptionPaymentProvider,
} from '@prisma/client';
import { PaymentNextAction } from './payment-next-action.type.js';
import { PaymentProviderCapabilities } from './payment-provider-capabilities.interface.js';
import { PaymentStartContext } from './payment-start-context.interface.js';

/**
 * How a payment is started and how its result is learned. The payment lifecycle
 * lives in SubscriptionPaymentService; a provider never changes statuses itself.
 * Online providers add fetchStatus, parseWebhook and cancel (plan, section 11).
 */
export interface PaymentProvider {
  readonly code: SubscriptionPaymentProvider;
  readonly capabilities: PaymentProviderCapabilities;
  /** Called after the payment row is committed; safe to call again for the same payment. */
  start(
    payment: SubscriptionPayment,
    ctx: PaymentStartContext,
  ): Promise<PaymentNextAction>;
}

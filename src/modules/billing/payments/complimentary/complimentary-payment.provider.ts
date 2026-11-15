import { Injectable } from '@nestjs/common';
import { SubscriptionPaymentProvider } from '@prisma/client';
import { PaymentNextActionType } from '../../enums/payment-next-action-type.enum.js';
import { PaymentNextAction } from '../../interfaces/payment-next-action.type.js';
import { PaymentProvider } from '../../interfaces/payment-provider.interface.js';

/** Extension without payment: an admin creates and confirms it at once, amount = 0. */
@Injectable()
export class ComplimentaryPaymentProvider implements PaymentProvider {
  readonly code = SubscriptionPaymentProvider.COMPLIMENTARY;
  readonly capabilities = {
    ownerInitiated: false,
    adminConfirmable: false,
    webhooks: false,
    statusPolling: false,
    recurring: false,
  };

  start(): Promise<PaymentNextAction> {
    return Promise.resolve({ type: PaymentNextActionType.NONE });
  }
}

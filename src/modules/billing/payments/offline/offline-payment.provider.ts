import { Injectable } from '@nestjs/common';
import {
  SubscriptionPayment,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { PaymentReference } from '../../compute/payment-reference.js';
import { PaymentNextActionType } from '../../enums/payment-next-action-type.enum.js';
import { PaymentNextAction } from '../../interfaces/payment-next-action.type.js';
import { PaymentProvider } from '../../interfaces/payment-provider.interface.js';
import { PaymentStartContext } from '../../interfaces/payment-start-context.interface.js';

/** Bank transfer, ERIP or cash: the owner gets instructions, a platform admin confirms. */
@Injectable()
export class OfflinePaymentProvider implements PaymentProvider {
  readonly code = SubscriptionPaymentProvider.OFFLINE;
  readonly capabilities = {
    ownerInitiated: true,
    adminConfirmable: true,
    webhooks: false,
    statusPolling: false,
    recurring: false,
  };

  start(
    payment: SubscriptionPayment,
    ctx: PaymentStartContext,
  ): Promise<PaymentNextAction> {
    if (payment.status !== SubscriptionPaymentStatus.PENDING)
      return Promise.resolve({ type: PaymentNextActionType.NONE });
    return Promise.resolve({
      type: PaymentNextActionType.INSTRUCTIONS,
      instructions: ctx.settings.offlinePaymentInstructions,
      reference: PaymentReference.format(payment.number),
      amount: MoneyUtils.format(payment.amount),
      currency: payment.currency,
      expiresAt: payment.expiresAt,
    });
  }
}

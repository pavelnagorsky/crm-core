import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  SubscriptionPayment,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PAYMENT_PROVIDERS } from '../constants/payment-providers.token.js';
import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';
import { PaymentNextAction } from '../interfaces/payment-next-action.type.js';
import { PaymentProvider } from '../interfaces/payment-provider.interface.js';
import { PaymentStartContext } from '../interfaces/payment-start-context.interface.js';

/** Every configured provider. A provider without its config is not registered. */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: ReadonlyMap<
    SubscriptionPaymentProvider,
    PaymentProvider
  >;

  constructor(@Inject(PAYMENT_PROVIDERS) providers: PaymentProvider[]) {
    this.providers = new Map(providers.map((p) => [p.code, p]));
  }

  find(code: SubscriptionPaymentProvider): PaymentProvider | null {
    return this.providers.get(code) ?? null;
  }

  get(code: SubscriptionPaymentProvider): PaymentProvider {
    const provider = this.find(code);
    if (!provider)
      throw new AppException(
        ErrorCode.BILLING_PROVIDER_NOT_AVAILABLE,
        HttpStatus.BAD_REQUEST,
        { provider: code },
      );
    return provider;
  }

  /** Provider an owner request can use; settings.paymentProvider must be one. */
  getOwnerInitiated(code: SubscriptionPaymentProvider): PaymentProvider {
    const provider = this.get(code);
    if (!provider.capabilities.ownerInitiated)
      throw new AppException(
        ErrorCode.BILLING_PROVIDER_NOT_AVAILABLE,
        HttpStatus.BAD_REQUEST,
        { provider: code },
      );
    return provider;
  }

  list(): PaymentProvider[] {
    return [...this.providers.values()];
  }

  /** What the owner does next. Only an open payment has an action. */
  nextAction(
    payment: SubscriptionPayment,
    ctx: PaymentStartContext,
  ): Promise<PaymentNextAction> {
    const provider = this.find(payment.provider);
    if (payment.status !== SubscriptionPaymentStatus.PENDING || !provider)
      return Promise.resolve({ type: PaymentNextActionType.NONE });
    return provider.start(payment, ctx);
  }
}

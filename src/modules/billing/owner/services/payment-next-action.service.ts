import { Injectable } from '@nestjs/common';
import { SubscriptionPayment } from '@prisma/client';
import { PaymentNextAction } from '../../interfaces/payment-next-action.type.js';
import { BillingLinkService } from '../../mail/services/billing-link.service.js';
import { PaymentProviderRegistry } from '../../payments/payment-provider.registry.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';

/** What the owner does next with a payment: read instructions, follow a redirect, wait. */
@Injectable()
export class PaymentNextActionService {
  constructor(
    private readonly providers: PaymentProviderRegistry,
    private readonly settings: BillingSettingsService,
    private readonly links: BillingLinkService,
  ) {}

  async forPayment(payment: SubscriptionPayment): Promise<PaymentNextAction> {
    return this.providers.nextAction(payment, {
      settings: await this.settings.get(),
      returnUrl: this.links.billing(payment.brandId),
    });
  }
}

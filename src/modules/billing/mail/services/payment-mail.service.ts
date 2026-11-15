import { Injectable, Logger } from '@nestjs/common';
import {
  SubscriptionPayment,
  SubscriptionPaymentProvider,
} from '@prisma/client';
import { BrandService } from '../../../brand/services/brand.service.js';
import { AdminSubscriptionPaymentRequestedNotification } from '../../../notifications/messages/admin-subscription-payment-requested.notification.js';
import { SubscriptionPaymentReceivedNotification } from '../../../notifications/messages/subscription-payment-received.notification.js';
import { SubscriptionPaymentRequestedNotification } from '../../../notifications/messages/subscription-payment-requested.notification.js';
import { UserService } from '../../../user/services/user.service.js';
import { PaymentNextActionType } from '../../enums/payment-next-action-type.enum.js';
import { PaymentNextAction } from '../../interfaces/payment-next-action.type.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { BillingEmailFormat } from '../billing-email-format.js';
import { BillingLinkService } from './billing-link.service.js';
import { BillingMailSender } from './billing-mail-sender.service.js';

/**
 * Emails about payments (plan section 9.4). Best effort: a request or a payment
 * is never lost because of an email, a failure is only logged.
 */
@Injectable()
export class PaymentMailService {
  private readonly logger = new Logger(PaymentMailService.name);

  constructor(
    private readonly sender: BillingMailSender,
    private readonly links: BillingLinkService,
    private readonly settings: BillingSettingsService,
    private readonly subscriptions: SubscriptionService,
    private readonly brands: BrandService,
    private readonly users: UserService,
  ) {}

  /**
   * After an owner request: the owners get the instructions (only for INSTRUCTIONS),
   * the platform admin address learns about the new request.
   */
  async requested(
    payment: SubscriptionPayment,
    nextAction: PaymentNextAction,
    ownerUserId: string,
  ): Promise<void> {
    try {
      const [recipients, brandName, subscription, settings, owner] =
        await Promise.all([
          this.sender.owners(payment.brandId),
          this.brands.findName(payment.brandId),
          this.subscriptions.findByBrand(payment.brandId),
          this.settings.get(),
          this.users.findById(ownerUserId),
        ]);
      if (!brandName || !subscription) return;
      const base = BillingEmailFormat.payment(
        payment,
        brandName,
        subscription.timezone,
        this.links.billing(payment.brandId),
      );
      if (nextAction.type === PaymentNextActionType.INSTRUCTIONS)
        this.sender.send(
          recipients,
          {
            ...base,
            expiresAt: nextAction.expiresAt,
            instructions: nextAction.instructions,
          },
          (to, d) => new SubscriptionPaymentRequestedNotification(to, d),
        );
      if (settings.adminNotifyEmail)
        this.sender.send(
          [{ email: settings.adminNotifyEmail, firstName: null }],
          {
            ...base,
            ownerEmail: owner.email ?? null,
            comment: payment.ownerComment,
            expiresAt: payment.expiresAt,
            actionLink: this.links.adminPayment(payment),
          },
          (to, d) => new AdminSubscriptionPaymentRequestedNotification(to, d),
        );
    } catch (error) {
      this.logger.error(
        `Payment ${payment.id}: request emails failed`,
        error as Error,
      );
    }
  }

  /** A payment was applied; a complimentary extension sends nothing. */
  async received(payment: SubscriptionPayment): Promise<void> {
    if (payment.provider === SubscriptionPaymentProvider.COMPLIMENTARY) return;
    try {
      const [recipients, brandName, subscription] = await Promise.all([
        this.sender.owners(payment.brandId),
        this.brands.findName(payment.brandId),
        this.subscriptions.findByBrand(payment.brandId),
      ]);
      if (!brandName || !subscription) return;
      this.sender.send(
        recipients,
        {
          ...BillingEmailFormat.payment(
            payment,
            brandName,
            subscription.timezone,
            this.links.billing(payment.brandId),
          ),
          lastDay: BillingEmailFormat.lastMoment(subscription.accessEndsAt),
        },
        (to, d) => new SubscriptionPaymentReceivedNotification(to, d),
      );
    } catch (error) {
      this.logger.error(
        `Payment ${payment.id}: receipt emails failed`,
        error as Error,
      );
    }
  }
}

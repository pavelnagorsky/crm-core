import { Injectable, Logger } from '@nestjs/common';
import {
  BillingPeriod,
  BillingPlan,
  SubscriptionNoticeKind,
} from '@prisma/client';
import { BrandService } from '../../../brand/services/brand.service.js';
import { SubscriptionEmailData } from '../../../notifications/interfaces/subscription-email-data.interface.js';
import { SubscriptionAccessEndedNotification } from '../../../notifications/messages/subscription-access-ended.notification.js';
import { SubscriptionAccessLimitedNotification } from '../../../notifications/messages/subscription-access-limited.notification.js';
import { SubscriptionPeriodEndingNotification } from '../../../notifications/messages/subscription-period-ending.notification.js';
import { SubscriptionTrialEndingNotification } from '../../../notifications/messages/subscription-trial-ending.notification.js';
import { PricingCountryResolver } from '../../compute/pricing-country.resolver.js';
import { SubscriptionStateCalculator } from '../../compute/subscription-state.calculator.js';
import { BILLING_CONTACTS } from '../../constants/billing-contacts.js';
import { SubscriptionNoticeDue } from '../../interfaces/subscription-notice-due.interface.js';
import { SubscriptionNotificationFactory } from '../../interfaces/subscription-notification-factory.type.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import { SubscriptionPaymentService } from '../../payments/services/subscription-payment.service.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { BillingUsageService } from '../../usage/services/billing-usage.service.js';
import { BillingEmailFormat } from '../billing-email-format.js';
import { BillingLinkService } from './billing-link.service.js';
import { BillingMailSender } from './billing-mail-sender.service.js';

/** Text variant of a notice when a payment request is already open. */
const PENDING_VARIANT = 'PENDING';
/** Trial-ending variant when no standard plan fits the brand. */
const DISCUSS_VARIANT = 'DISCUSS';

/** TRIAL_ENDING, PERIOD_ENDING, ACCESS_ENDED, ACCESS_LIMITED (plan section 9.1). */
@Injectable()
export class SubscriptionNoticeMailService {
  private readonly logger = new Logger(SubscriptionNoticeMailService.name);

  constructor(
    private readonly sender: BillingMailSender,
    private readonly links: BillingLinkService,
    private readonly brands: BrandService,
    private readonly usage: BillingUsageService,
    private readonly settings: BillingSettingsService,
    private readonly plans: BillingPlanService,
    private readonly payments: SubscriptionPaymentService,
  ) {}

  async send(
    subscription: SubscriptionWithPlan,
    due: SubscriptionNoticeDue,
    now = new Date(),
  ): Promise<void> {
    const brandId = subscription.brandId;
    const [recipients, brandName, settings, pending] = await Promise.all([
      this.sender.owners(brandId),
      this.brands.findName(brandId),
      this.settings.get(),
      this.payments.findPendingByBrand(brandId),
    ]);
    if (!recipients.length || !brandName) {
      this.logger.warn(
        `Notice ${due.kind} for brand ${brandId}: no recipients, skipped`,
      );
      return;
    }
    const actionLink = this.links.billing(brandId);
    const data: SubscriptionEmailData = pending
      ? {
          ...BillingEmailFormat.payment(
            pending,
            brandName,
            subscription.timezone,
            actionLink,
          ),
          variant: PENDING_VARIANT,
        }
      : {
          brandId,
          brandName,
          recipientFirstName: null,
          timezone: subscription.timezone,
          actionLink,
        };
    const lastDay = BillingEmailFormat.lastMoment(subscription.accessEndsAt);

    let create: SubscriptionNotificationFactory;
    switch (due.kind) {
      case SubscriptionNoticeKind.TRIAL_ENDING:
        create = (to, d) => new SubscriptionTrialEndingNotification(to, d);
        data.daysLeft = due.daysBefore;
        data.lastDay = lastDay;
        if (!pending) await this.addSuggestion(subscription, data, now);
        break;
      case SubscriptionNoticeKind.PERIOD_ENDING:
        create = (to, d) => new SubscriptionPeriodEndingNotification(to, d);
        data.daysLeft = due.daysBefore;
        data.lastDay = lastDay;
        if (!pending) await this.addRenewal(subscription, data, now);
        break;
      case SubscriptionNoticeKind.ACCESS_ENDED:
        create = (to, d) => new SubscriptionAccessEndedNotification(to, d);
        data.lastDay = lastDay;
        if (settings.enforcementEnabled)
          data.graceLastDay = BillingEmailFormat.lastMoment(
            SubscriptionStateCalculator.graceEndsAt(
              subscription,
              settings.graceDays,
            ),
          );
        break;
      case SubscriptionNoticeKind.ACCESS_LIMITED:
        create = (to, d) => new SubscriptionAccessLimitedNotification(to, d);
        break;
    }
    this.sender.send(recipients, data, create);
  }

  /** Trial end: the first standard plan that fits, or «Обсудить условия». */
  private async addSuggestion(
    subscription: SubscriptionWithPlan,
    data: SubscriptionEmailData,
    now: Date,
  ): Promise<void> {
    const usage = await this.usage.usage(subscription.brandId);
    const plan = await this.usage.suggestedPlan(
      subscription.countryCode,
      usage,
      now,
    );
    if (!plan) {
      data.variant = DISCUSS_VARIANT;
      data.actionLink = `mailto:${BILLING_CONTACTS.sales}`;
      return;
    }
    data.planName = plan.name;
    data.suggestedPlan = true;
    await this.addPrice(subscription, plan, BillingPeriod.MONTH, data, now);
  }

  /** Period end: the current plan and what a renewal costs today. */
  private async addRenewal(
    subscription: SubscriptionWithPlan,
    data: SubscriptionEmailData,
    now: Date,
  ): Promise<void> {
    if (!subscription.plan) return;
    data.planName = subscription.plan.name;
    await this.addPrice(
      subscription,
      subscription.plan,
      subscription.billingPeriod ?? BillingPeriod.MONTH,
      data,
      now,
    );
  }

  /** The price for the preferred period, else for the other one. */
  private async addPrice(
    subscription: SubscriptionWithPlan,
    plan: Pick<BillingPlan, 'id' | 'pricingMode'>,
    preferred: BillingPeriod,
    data: SubscriptionEmailData,
    now: Date,
  ): Promise<void> {
    const [plans, settings] = await Promise.all([
      this.plans.findAllCached(),
      this.settings.get(),
    ]);
    const other =
      preferred === BillingPeriod.MONTH
        ? BillingPeriod.YEAR
        : BillingPeriod.MONTH;
    for (const period of [preferred, other]) {
      const price = PricingCountryResolver.subscriptionPrice(
        subscription,
        plan,
        period,
        plans,
        settings.defaultCountryCode,
        now,
      );
      if (!price) continue;
      data.billingPeriod = period;
      data.amount = BillingEmailFormat.money(price.amount, price.currency);
      return;
    }
  }
}

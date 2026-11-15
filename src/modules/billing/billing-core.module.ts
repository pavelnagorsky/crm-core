import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { BillingFacade } from './billing.facade.js';
import { PAYMENT_PROVIDERS } from './constants/payment-providers.token.js';
import { ComplimentaryPaymentProvider } from './payments/complimentary/complimentary-payment.provider.js';
import { OfflinePaymentProvider } from './payments/offline/offline-payment.provider.js';
import { PaymentProviderRegistry } from './payments/payment-provider.registry.js';
import { ManualPaymentService } from './payments/services/manual-payment.service.js';
import { PaymentApplicationService } from './payments/services/payment-application.service.js';
import { PaymentConfirmationService } from './payments/services/payment-confirmation.service.js';
import { PaymentRequestService } from './payments/services/payment-request.service.js';
import { SubscriptionPaymentService } from './payments/services/subscription-payment.service.js';
import { BillingPlanService } from './plans/services/billing-plan.service.js';
import { BillingSettingsService } from './settings/services/billing-settings.service.js';
import { SubscriptionAccessService } from './subscriptions/services/subscription-access.service.js';
import { SubscriptionEventService } from './subscriptions/services/subscription-event.service.js';
import { SubscriptionNoticeService } from './subscriptions/services/subscription-notice.service.js';
import { SubscriptionPeriodService } from './subscriptions/services/subscription-period.service.js';
import { SubscriptionPlanService } from './subscriptions/services/subscription-plan.service.js';
import { SubscriptionStartService } from './subscriptions/services/subscription-start.service.js';
import { SubscriptionTermsService } from './subscriptions/services/subscription-terms.service.js';
import { SubscriptionService } from './subscriptions/services/subscription.service.js';

/**
 * Billing data and rules: settings, plans, subscriptions, payments and the facade
 * for other domains. Not global: brands, staff, locations and bookings import it
 * explicitly (plan section 10.1). Period and application services stay internal.
 */
@Module({
  imports: [AppCacheModule],
  providers: [
    OfflinePaymentProvider,
    ComplimentaryPaymentProvider,
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (
        offline: OfflinePaymentProvider,
        complimentary: ComplimentaryPaymentProvider,
      ) => [offline, complimentary],
      inject: [OfflinePaymentProvider, ComplimentaryPaymentProvider],
    },
    PaymentProviderRegistry,
    BillingSettingsService,
    BillingPlanService,
    SubscriptionService,
    SubscriptionEventService,
    SubscriptionNoticeService,
    SubscriptionStartService,
    SubscriptionPeriodService,
    SubscriptionPlanService,
    SubscriptionTermsService,
    SubscriptionAccessService,
    SubscriptionPaymentService,
    PaymentApplicationService,
    PaymentRequestService,
    PaymentConfirmationService,
    ManualPaymentService,
    BillingFacade,
  ],
  exports: [
    BillingFacade,
    BillingSettingsService,
    BillingPlanService,
    PaymentProviderRegistry,
    SubscriptionService,
    SubscriptionEventService,
    SubscriptionNoticeService,
    SubscriptionStartService,
    SubscriptionPlanService,
    SubscriptionTermsService,
    SubscriptionAccessService,
    SubscriptionPaymentService,
    PaymentRequestService,
    PaymentConfirmationService,
    ManualPaymentService,
  ],
})
export class BillingCoreModule {}

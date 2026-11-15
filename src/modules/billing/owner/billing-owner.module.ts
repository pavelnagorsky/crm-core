import { Module } from '@nestjs/common';
import { BrandModule } from '../../brand/brand.module.js';
import { BillingCoreModule } from '../billing-core.module.js';
import { BillingMailModule } from '../mail/billing-mail.module.js';
import { BillingUsageModule } from '../usage/billing-usage.module.js';
import { BrandSubscriptionController } from './controllers/brand-subscription.controller.js';
import { PublicBillingPlansController } from './controllers/public-billing-plans.controller.js';
import { UserSubscriptionStatesController } from './controllers/user-subscription-states.controller.js';
import { BrandPaymentRequestService } from './services/brand-payment-request.service.js';
import { BrandPlanChangeService } from './services/brand-plan-change.service.js';
import { BrandQuoteContextService } from './services/brand-quote-context.service.js';
import { BrandSubscriptionQueryService } from './services/brand-subscription-query.service.js';
import { PaymentNextActionService } from './services/payment-next-action.service.js';
import { UserSubscriptionStatesService } from './services/user-subscription-states.service.js';

/** Public prices and the brand owner side of billing (plan section 8.2). */
@Module({
  imports: [
    BillingCoreModule,
    BillingUsageModule,
    BillingMailModule,
    BrandModule,
  ],
  controllers: [
    PublicBillingPlansController,
    UserSubscriptionStatesController,
    BrandSubscriptionController,
  ],
  providers: [
    PaymentNextActionService,
    BrandQuoteContextService,
    BrandSubscriptionQueryService,
    UserSubscriptionStatesService,
    BrandPaymentRequestService,
    BrandPlanChangeService,
  ],
})
export class BillingOwnerModule {}

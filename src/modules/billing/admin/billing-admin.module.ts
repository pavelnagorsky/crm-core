import { Module } from '@nestjs/common';
import { AccessModule } from '../../access/access.module.js';
import { BrandModule } from '../../brand/brand.module.js';
import { LocationModule } from '../../location/location.module.js';
import { UserModule } from '../../user/user.module.js';
import { BillingCoreModule } from '../billing-core.module.js';
import { BillingMailModule } from '../mail/billing-mail.module.js';
import { BillingUsageModule } from '../usage/billing-usage.module.js';
import { AdminBillingPlansController } from './controllers/admin-billing-plans.controller.js';
import { AdminBillingSettingsController } from './controllers/admin-billing-settings.controller.js';
import { AdminSubscriptionPaymentsController } from './controllers/admin-subscription-payments.controller.js';
import { AdminSubscriptionsController } from './controllers/admin-subscriptions.controller.js';
import { AdminBillingPlansService } from './services/admin-billing-plans.service.js';
import { AdminSubscriptionAssessor } from './services/admin-subscription-assessor.service.js';
import { AdminSubscriptionBillingService } from './services/admin-subscription-billing.service.js';
import { AdminSubscriptionFilter } from './services/admin-subscription-filter.service.js';
import { AdminSubscriptionLifecycleService } from './services/admin-subscription-lifecycle.service.js';
import { AdminSubscriptionPaymentsService } from './services/admin-subscription-payments.service.js';
import { AdminSubscriptionsQueryService } from './services/admin-subscriptions-query.service.js';

/** Platform admin side of billing (plan section 8.3). */
@Module({
  imports: [
    BillingCoreModule,
    BillingUsageModule,
    BillingMailModule,
    BrandModule,
    AccessModule,
    UserModule,
    LocationModule,
  ],
  controllers: [
    AdminBillingPlansController,
    AdminBillingSettingsController,
    AdminSubscriptionsController,
    AdminSubscriptionPaymentsController,
  ],
  providers: [
    AdminBillingPlansService,
    AdminSubscriptionFilter,
    AdminSubscriptionAssessor,
    AdminSubscriptionsQueryService,
    AdminSubscriptionLifecycleService,
    AdminSubscriptionBillingService,
    AdminSubscriptionPaymentsService,
  ],
})
export class BillingAdminModule {}

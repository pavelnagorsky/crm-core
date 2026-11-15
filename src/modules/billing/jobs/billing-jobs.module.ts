import { Module } from '@nestjs/common';
import { BillingCoreModule } from '../billing-core.module.js';
import { BillingMailModule } from '../mail/billing-mail.module.js';
import { SubscriptionNoticesCron } from './services/subscription-notices.cron.js';
import { SubscriptionPaymentsCron } from './services/subscription-payments.cron.js';

@Module({
  imports: [BillingCoreModule, BillingMailModule],
  providers: [SubscriptionNoticesCron, SubscriptionPaymentsCron],
})
export class BillingJobsModule {}

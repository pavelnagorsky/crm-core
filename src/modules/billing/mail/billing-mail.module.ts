import { Module } from '@nestjs/common';
import { AccessModule } from '../../access/access.module.js';
import { BrandModule } from '../../brand/brand.module.js';
import { UserModule } from '../../user/user.module.js';
import { BillingCoreModule } from '../billing-core.module.js';
import { BillingUsageModule } from '../usage/billing-usage.module.js';
import { BillingLinkService } from './services/billing-link.service.js';
import { BillingMailSender } from './services/billing-mail-sender.service.js';
import { PaymentMailService } from './services/payment-mail.service.js';
import { SubscriptionNoticeMailService } from './services/subscription-notice-mail.service.js';

/** Platform billing emails and links, shared by the API and the notices cron. */
@Module({
  imports: [
    BillingCoreModule,
    BillingUsageModule,
    AccessModule,
    UserModule,
    BrandModule,
  ],
  providers: [
    BillingLinkService,
    BillingMailSender,
    PaymentMailService,
    SubscriptionNoticeMailService,
  ],
  exports: [
    BillingLinkService,
    PaymentMailService,
    SubscriptionNoticeMailService,
  ],
})
export class BillingMailModule {}

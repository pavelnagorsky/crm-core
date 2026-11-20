import { Module } from '@nestjs/common';
import { JobQueueModule } from '../../shared/queue/job-queue.module.js';
import { BrandModule } from '../brand/brand.module.js';
import { LocationModule } from '../location/location.module.js';
import { UserModule } from '../user/user.module.js';
import { EmailChannel } from './channels/email/email.channel.js';
import { EmailRenderer } from './channels/email/email.renderer.js';
import { AdminEmailsController } from './controllers/admin-emails.controller.js';
import { EmailAdminService } from './services/email-admin.service.js';
import { EmailDeliveryService } from './services/email-delivery.service.js';
import { EmailLogService } from './services/email-log.service.js';
import { EmailOutboxService } from './services/email-outbox.service.js';
import { EmailQueueService } from './services/email-queue.service.js';
import { EmailStatsService } from './services/email-stats.service.js';
import { NotificationsService } from './services/notifications.service.js';

@Module({
  imports: [LocationModule, BrandModule, UserModule, JobQueueModule],
  controllers: [AdminEmailsController],
  providers: [
    NotificationsService,
    EmailLogService,
    EmailQueueService,
    EmailDeliveryService,
    EmailOutboxService,
    EmailStatsService,
    EmailAdminService,
    EmailChannel,
    EmailRenderer,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}

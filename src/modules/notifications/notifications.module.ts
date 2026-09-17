import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { EmailChannel } from './channels/email/email.channel.js';

@Module({
  providers: [NotificationsService, EmailChannel],
})
export class NotificationsModule {}

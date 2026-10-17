import { Module } from '@nestjs/common';
import { EmailChannel } from './channels/email/email.channel.js';
import { EmailRenderer } from './channels/email/email.renderer.js';
import { NotificationsService } from './services/notifications.service.js';

@Module({
  providers: [NotificationsService, EmailChannel, EmailRenderer],
  exports: [NotificationsService],
})
export class NotificationsModule {}

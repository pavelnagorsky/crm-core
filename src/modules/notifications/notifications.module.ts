import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { EmailChannel } from './channels/email/email.channel.js';
import { EmailRendererService } from './channels/email/email-renderer.service.js';

@Module({
  providers: [NotificationsService, EmailChannel, EmailRendererService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

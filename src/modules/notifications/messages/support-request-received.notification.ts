import { EmailTemplate } from '../enums/email-template.enum.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { SupportRequestEmailData } from '../interfaces/support-request-email-data.interface.js';
import { AbstractNotification } from './abstract.notification.js';

/** Tells the author that support got the request and will answer by email. */
export class SupportRequestReceivedNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.SUPPORT_REQUEST_RECEIVED;

  constructor(private readonly request: SupportRequestEmailData) {
    super();
  }

  toEmail(): ChannelPayload {
    return {
      to: this.request.email,
      data: { message: this.request.message },
    };
  }
}

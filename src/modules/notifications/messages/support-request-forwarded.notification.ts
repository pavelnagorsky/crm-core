import { EmailTemplate } from '../enums/email-template.enum.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { SupportRequestEmailData } from '../interfaces/support-request-email-data.interface.js';
import { EMAIL_REPLY_TO_KEY } from '../rules/email-sender.rules.js';
import { AbstractNotification } from './abstract.notification.js';

/** A new support request in the support mailbox; Reply answers the author. */
export class SupportRequestForwardedNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.SUPPORT_REQUEST_FORWARDED;

  constructor(
    private readonly supportEmail: string,
    private readonly request: SupportRequestEmailData,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return {
      to: this.supportEmail,
      data: { ...this.request, [EMAIL_REPLY_TO_KEY]: this.request.email },
    };
  }
}

import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailReference } from '../interfaces/email-reference.interface.js';

export class AccessInvitationNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.ACCESS_INVITATION;

  constructor(
    private readonly email: string,
    private readonly invitationLink: string,
    private readonly brandName: string,
    private readonly brandLogoUrl: string | null = null,
    private readonly expiresAt: Date | null = null,
  ) {
    super();
  }

  override reference(): EmailReference {
    return { validUntil: this.expiresAt };
  }

  toEmail(): ChannelPayload {
    return {
      to: this.email,
      data: {
        brandName: this.brandName,
        brandLogoUrl: this.brandLogoUrl,
        invitationLink: this.invitationLink,
        expiresAt: this.expiresAt,
      },
    };
  }
}

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccessService } from '../../../access/services/access.service.js';
import { SubscriptionEmailData } from '../../../notifications/interfaces/subscription-email-data.interface.js';
import { NOTIFICATION_EVENT } from '../../../notifications/services/notifications.service.js';
import { UserService } from '../../../user/services/user.service.js';
import { MailRecipient } from '../../interfaces/mail-recipient.interface.js';
import { SubscriptionNotificationFactory } from '../../interfaces/subscription-notification-factory.type.js';

/** Who gets billing emails and how they leave: one notification per recipient. */
@Injectable()
export class BillingMailSender {
  constructor(
    private readonly events: EventEmitter2,
    private readonly accessService: AccessService,
    private readonly users: UserService,
  ) {}

  /** Owners with a confirmed email, at the moment of sending (plan section 9.3). */
  async owners(brandId: string): Promise<MailRecipient[]> {
    const ids =
      (await this.accessService.findOwnerIdsByBrands([brandId])).get(brandId) ??
      [];
    const contacts = await this.users.findVerifiedContacts(ids);
    return contacts
      .filter((c): c is typeof c & { email: string } => !!c.email)
      .map((c) => ({ email: c.email, firstName: c.firstName }));
  }

  send(
    recipients: MailRecipient[],
    data: SubscriptionEmailData,
    create: SubscriptionNotificationFactory,
  ): void {
    for (const recipient of recipients)
      this.events.emit(
        NOTIFICATION_EVENT,
        create(recipient.email, {
          ...data,
          recipientFirstName: recipient.firstName,
        }),
      );
  }
}

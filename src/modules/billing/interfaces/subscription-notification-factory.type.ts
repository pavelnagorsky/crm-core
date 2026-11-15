import { SubscriptionEmailData } from '../../notifications/interfaces/subscription-email-data.interface.js';
import { AbstractNotification } from '../../notifications/messages/abstract.notification.js';

/** Builds the notification of one recipient from the shared email data. */
export type SubscriptionNotificationFactory = (
  email: string,
  data: SubscriptionEmailData,
) => AbstractNotification;

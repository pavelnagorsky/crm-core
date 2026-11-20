import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { EmailReference } from '../interfaces/email-reference.interface.js';

export abstract class AbstractNotification {
  abstract readonly audience: NotificationAudience;
  /**
   * Queued and retried until delivered. False for a one-time secret: it is sent once and its
   * content is never stored, and the user can ask for another.
   */
  readonly durable: boolean = true;

  /** What the notification is about, for the delivery log. */
  reference(): EmailReference {
    return {};
  }
}

import { NotificationChannel } from '../enums/notification-channel.enum.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';

export abstract class AbstractNotification {
  abstract readonly strategy: DeliveryStrategy;
  abstract readonly channels: NotificationChannel[];

  /** Email recipient address. Required when channels includes EMAIL. */
  abstract readonly recipientEmail: string | undefined;

  /** Template name (relative to templates dir, without extension). */
  abstract readonly emailTemplate: string;

  /** Template context passed to the template engine. */
  abstract emailContext(): Record<string, unknown>;
}

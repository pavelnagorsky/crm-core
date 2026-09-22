import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AbstractChannel } from './channels/abstract.channel.js';
import { EmailChannel } from './channels/email/email.channel.js';
import { AbstractNotification } from './notifications/abstract.notification.js';
import { DeliveryStrategy } from './enums/delivery-strategy.enum.js';

export const NOTIFICATION_EVENT = 'notification';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly channels: AbstractChannel[];

  constructor(private readonly emailChannel: EmailChannel) {
    this.channels = [emailChannel];
  }

  @OnEvent(NOTIFICATION_EVENT, { suppressErrors: true })
  async handle(notification: AbstractNotification): Promise<void> {
    try {
      await this.dispatch(notification);
    } catch (e: any) {
      this.logger.error(`Unhandled error delivering ${notification.constructor.name}: ${e.message}`, e.stack);
    }
  }

  private async dispatch(notification: AbstractNotification): Promise<void> {
    const available = this.channels.filter((ch) => ch.canHandle(notification));

    if (notification.strategy === DeliveryStrategy.FIRST_AVAILABLE) {
      for (const ch of available) {
        try {
          await ch.send(notification);
          return;
        } catch (e: any) {
          this.logger.warn(`${ch.name} failed for ${notification.constructor.name}: ${e.message}`);
        }
      }
      this.logger.warn(`All channels failed for ${notification.constructor.name}`);
    } else {
      await Promise.all(
        available.map((ch) =>
          ch.send(notification).catch((e: any) =>
            this.logger.warn(`${ch.name} failed for ${notification.constructor.name}: ${e.message}`),
          ),
        ),
      );
    }
  }
}

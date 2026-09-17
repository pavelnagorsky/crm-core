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

  /** Synchronous delivery — use for critical notifications where failure must propagate to the caller. */
  async send(notification: AbstractNotification): Promise<void> {
    await this.dispatch(notification);
  }

  @OnEvent(NOTIFICATION_EVENT)
  async handle(notification: AbstractNotification): Promise<void> {
    await this.dispatch(notification);
  }

  private async dispatch(notification: AbstractNotification): Promise<void> {
    const available = this.channels.filter((ch) => ch.canHandle(notification));

    switch (notification.strategy) {
      case DeliveryStrategy.FIRST_AVAILABLE:
        await this.sendFirstAvailable(notification, available);
        break;
      case DeliveryStrategy.ALL:
        await this.sendAll(notification, available);
        break;
      case DeliveryStrategy.BEST_EFFORT:
        await this.sendBestEffort(notification, available);
        break;
    }
  }

  private async sendFirstAvailable(notification: AbstractNotification, available: AbstractChannel[]): Promise<void> {
    for (const channel of available) {
      try {
        await channel.send(notification);
        return;
      } catch (e: any) {
        this.logger.warn(`[FIRST_AVAILABLE] ${channel.name} failed for ${notification.constructor.name}: ${e.message}`);
      }
    }
    this.logger.warn(`[FIRST_AVAILABLE] All channels failed for ${notification.constructor.name}`);
  }

  private async sendAll(notification: AbstractNotification, available: AbstractChannel[]): Promise<void> {
    await Promise.all(
      available.map((ch) =>
        ch.send(notification).catch((e: any) =>
          this.logger.warn(`[ALL] ${ch.name} failed for ${notification.constructor.name}: ${e.message}`),
        ),
      ),
    );
  }

  private async sendBestEffort(notification: AbstractNotification, available: AbstractChannel[]): Promise<void> {
    if (!available.length) {
      this.logger.warn(`[BEST_EFFORT] No channel available for ${notification.constructor.name}`);
      return;
    }
    for (const channel of available) {
      try {
        await channel.send(notification);
      } catch (e: any) {
        this.logger.warn(`[BEST_EFFORT] ${channel.name} failed for ${notification.constructor.name}: ${e.message}`);
      }
    }
  }
}

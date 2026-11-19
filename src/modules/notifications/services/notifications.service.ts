import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { INotificationsConfig } from '../../../config/interfaces/notifications-config.interface.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AbstractChannel } from '../channels/abstract.channel.js';
import { EmailChannel } from '../channels/email/email.channel.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from '../messages/abstract.notification.js';

export const NOTIFICATION_EVENT = 'notification';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly channels: AbstractChannel[];
  private readonly clientNotificationsEnabled: boolean;

  constructor(
    private readonly emailChannel: EmailChannel,
    config: ConfigService,
  ) {
    this.channels = [emailChannel];
    this.clientNotificationsEnabled = config.get<INotificationsConfig>(
      'notificationsConfig',
    )!.clientNotificationsEnabled;
  }

  @OnEvent(NOTIFICATION_EVENT, { suppressErrors: true })
  async handle(notification: AbstractNotification): Promise<void> {
    if (this.isMuted(notification)) {
      this.logger.log(
        `Client notifications disabled, skipping ${notification.constructor.name}`,
      );
      return;
    }
    try {
      await this.dispatch(notification);
    } catch (e: any) {
      this.logger.error(
        `Unhandled error delivering ${notification.constructor.name}: ${e.message}`,
        e.stack,
      );
    }
  }

  async sendEmail(
    notification: AbstractNotification & HasEmailChannel,
  ): Promise<void> {
    if (this.isMuted(notification))
      throw new AppException(
        ErrorCode.EMAIL_DELIVERY_FAILED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    try {
      await this.emailChannel.send(notification);
    } catch {
      throw new AppException(
        ErrorCode.EMAIL_DELIVERY_FAILED,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Emails to CRM accounts always go out; only emails to a business's clients follow `CLIENT_NOTIFICATIONS_ENABLED`. */
  private isMuted(notification: AbstractNotification): boolean {
    return (
      notification.audience === NotificationAudience.CLIENT &&
      !this.clientNotificationsEnabled
    );
  }

  private async dispatch(notification: AbstractNotification): Promise<void> {
    const available = this.channels.filter((ch) => ch.canHandle(notification));

    if (notification.strategy === DeliveryStrategy.FIRST_AVAILABLE) {
      for (const ch of available) {
        try {
          await ch.send(notification);
          return;
        } catch (e: any) {
          this.logger.warn(
            `${ch.name} failed for ${notification.constructor.name}: ${e.message}`,
          );
        }
      }
      this.logger.warn(
        `All channels failed for ${notification.constructor.name}`,
      );
    } else {
      await Promise.all(
        available.map((ch) =>
          ch
            .send(notification)
            .catch((e: any) =>
              this.logger.warn(
                `${ch.name} failed for ${notification.constructor.name}: ${e.message}`,
              ),
            ),
        ),
      );
    }
  }
}

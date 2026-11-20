import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailAudience, EmailCancelReason, Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { EmailContent } from '../interfaces/email-content.interface.js';
import { EmailMessageMeta } from '../interfaces/email-message-meta.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from '../messages/abstract.notification.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EmailLogService } from './email-log.service.js';
import { EmailOutboxService } from './email-outbox.service.js';

export const NOTIFICATION_EVENT = 'notification';

type EmailNotification = AbstractNotification & HasEmailChannel;

/** What other modules use to send notifications. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly outbox: EmailOutboxService,
    private readonly delivery: EmailDeliveryService,
    private readonly log: EmailLogService,
  ) {}

  /** `NOTIFICATION_EVENT` listener: queues durable emails, sends one-time secrets directly. */
  @OnEvent(NOTIFICATION_EVENT, { suppressErrors: true })
  async handle(notification: EmailNotification): Promise<void> {
    try {
      if (notification.durable) await this.enqueue(notification);
      else if (this.delivery.isMuted(this.meta(notification).audience))
        this.logger.log(
          `Client notifications disabled, skipping ${notification.constructor.name}`,
        );
      else
        await this.delivery.sendDirect(
          this.content(notification),
          this.meta(notification),
        );
    } catch (e: any) {
      this.logger.error(
        `Unhandled error delivering ${notification.constructor.name}: ${e.message}`,
        e.stack,
      );
    }
  }

  /**
   * Logs and queues the email for delivery with retries. Inside `tx` it is queued only if the
   * transaction commits, so marking a booking as notified and queueing its email go together.
   * A muted client email is logged as skipped.
   */
  async enqueue(
    notification: EmailNotification,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.outbox.enqueue(
      this.content(notification),
      this.meta(notification),
      tx,
    );
  }

  /** Sends now and reports failure to the caller; the content is not logged. */
  async sendEmail(notification: EmailNotification): Promise<void> {
    const meta = this.meta(notification);
    if (this.delivery.isMuted(meta.audience))
      throw new AppException(
        ErrorCode.EMAIL_DELIVERY_FAILED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const result = await this.delivery.sendDirect(
      this.content(notification),
      meta,
    );
    if (!result.sent)
      throw new AppException(
        ErrorCode.EMAIL_DELIVERY_FAILED,
        HttpStatus.BAD_GATEWAY,
      );
  }

  /** The booking changed under its client emails: what has not gone out yet would mislead. */
  async cancelPendingForBooking(
    bookingId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = await this.log.findPendingClientIds(bookingId, tx);
    if (!ids.length) return;
    await this.log.cancel(ids, EmailCancelReason.BOOKING_CHANGED, null, tx);
    this.logger.log(
      `pending client emails cancelled: bookingId=${bookingId} count=${ids.length}`,
    );
  }

  private content(notification: EmailNotification): EmailContent {
    return { template: notification.emailTemplate, ...notification.toEmail() };
  }

  private meta(notification: EmailNotification): EmailMessageMeta {
    return {
      audience:
        notification.audience === NotificationAudience.CLIENT
          ? EmailAudience.CLIENT
          : EmailAudience.ACCOUNT,
      reference: notification.reference(),
    };
  }
}

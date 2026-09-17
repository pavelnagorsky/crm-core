import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { IMailerConfig } from '../../../../config/configuration.js';
import { AbstractChannel } from '../abstract.channel.js';
import { AbstractNotification } from '../../notifications/abstract.notification.js';
import { NotificationChannel } from '../../enums/notification-channel.enum.js';

@Injectable()
export class EmailChannel extends AbstractChannel {
  readonly name = 'EmailChannel';
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    super();
    const cfg = this.config.get<IMailerConfig>('emailConfig')!;
    this.from = cfg.email;
    this.transporter = createTransport({
      service: 'gmail',
      auth: { user: cfg.email, pass: cfg.emailPw },
    });
  }

  canHandle(notification: AbstractNotification): boolean {
    return notification.channels.includes(NotificationChannel.EMAIL) && !!notification.recipientEmail;
  }

  async send(notification: AbstractNotification): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: notification.recipientEmail,
      subject: this.resolveSubject(notification.emailTemplate),
      text: JSON.stringify(notification.emailContext()),
    });
    this.logger.log(`[EMAIL] template=${notification.emailTemplate} to=${notification.recipientEmail}`);
  }

  private resolveSubject(template: string): string {
    const subjects: Record<string, string> = {
      'confirm-email': 'Confirm your email',
      'reset-password': 'Reset your password',
      'staff-invitation': 'You have been invited',
      'booking-confirmed': 'Booking confirmed',
      'booking-cancelled': 'Booking cancelled',
    };
    return subjects[template] ?? template;
  }
}

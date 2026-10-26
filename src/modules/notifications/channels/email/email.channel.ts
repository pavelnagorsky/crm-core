import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { IMailerConfig } from '../../../../config/interfaces/mailer-config.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { HasEmailChannel } from '../../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from '../../messages/abstract.notification.js';
import { AbstractChannel } from '../abstract.channel.js';
import { EmailRenderer } from './email.renderer.js';

const SMTP_TIMEOUT_MS = 15_000;

@Injectable()
export class EmailChannel extends AbstractChannel {
  readonly name = 'EmailChannel';
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    config: ConfigService,
    private readonly renderer: EmailRenderer,
    private readonly locations: LocationService,
  ) {
    super();
    const cfg = config.get<IMailerConfig>('emailConfig')!;
    this.from = cfg.email;
    this.transporter = createTransport({
      host: 'smtp.hoster.by',
      port: 465,
      secure: true,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      auth: { user: cfg.email, pass: cfg.emailPw },
    });
  }

  canHandle(notification: AbstractNotification): boolean {
    return 'toEmail' in notification;
  }

  async send(notification: AbstractNotification): Promise<void> {
    const n = notification as AbstractNotification & HasEmailChannel;
    const { to, data } = n.toEmail();
    let context = data;
    if (typeof data.locationId === 'string') {
      const location = await this.locations.findPublicProfile(data.locationId);
      context = {
        ...data,
        brandName: location.brand.name,
        brandLogoUrl: location.brand.logoFile?.url ?? null,
      };
    }
    const { subject, html, senderName, attachments } = this.renderer.render(
      n.emailTemplate,
      context,
    );
    await this.transporter.sendMail({
      from: { name: senderName, address: this.from },
      to,
      subject,
      html,
      attachments,
    });
    this.logger.log(`[EMAIL] template=${n.emailTemplate} to=${to}`);
  }
}

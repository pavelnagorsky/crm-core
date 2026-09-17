import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { IMailerConfig } from '../../../../config/configuration.js';
import { AbstractChannel } from '../abstract.channel.js';
import { AbstractNotification } from '../../notifications/abstract.notification.js';
import { HasEmailChannel } from '../../interfaces/has-email-channel.interface.js';
import { EmailRendererService, EmailTemplate } from './email-renderer.service.js';

@Injectable()
export class EmailChannel extends AbstractChannel {
  readonly name = 'EmailChannel';
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    private readonly config: ConfigService,
    private readonly renderer: EmailRendererService,
  ) {
    super();
    const cfg = this.config.get<IMailerConfig>('emailConfig')!;
    this.from = cfg.email;
    this.transporter = createTransport({
      service: 'gmail',
      auth: { user: cfg.email, pass: cfg.emailPw },
    });
  }

  canHandle(notification: AbstractNotification): boolean {
    return 'toEmail' in notification;
  }

  async send(notification: AbstractNotification): Promise<void> {
    const n = notification as AbstractNotification & HasEmailChannel;
    const { to, data } = n.toEmail();
    const { subject, html } = this.renderer.render(n.emailTemplate, data);
    await this.transporter.sendMail({ from: this.from, to, subject, html });
    this.logger.log(`[EMAIL] template=${n.emailTemplate} to=${to}`);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { IMailerConfig } from '../../../../config/interfaces/mailer-config.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { ComposedEmail } from '../../interfaces/composed-email.interface.js';
import { EmailContent } from '../../interfaces/email-content.interface.js';
import { EmailPreview } from '../../interfaces/email-preview.interface.js';
import { EmailMailbox } from '../../enums/email-mailbox.enum.js';
import { resolveEmailSender } from '../../rules/email-sender.rules.js';
import { EmailRenderer } from './email.renderer.js';

const SMTP_TIMEOUT_MS = 15_000;
const IMPLICIT_TLS_PORT = 465;

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);
  private readonly config: IMailerConfig;
  private readonly mailboxes: Record<EmailMailbox, string>;
  /** One per mailbox address: the server wants the login to match From. */
  private readonly transporters = new Map<string, Transporter>();

  constructor(
    config: ConfigService,
    private readonly renderer: EmailRenderer,
    private readonly locations: LocationService,
  ) {
    this.config = config.get<IMailerConfig>('emailConfig')!;
    this.mailboxes = {
      [EmailMailbox.NOREPLY]: this.config.email,
      [EmailMailbox.SALES]: this.config.salesEmail,
      [EmailMailbox.SUPPORT]: this.config.supportEmail,
    };
  }

  async compose(content: EmailContent): Promise<ComposedEmail> {
    return this.render(await this.enrich(content));
  }

  /** Adds the brand details of a business email. Read now, so a retried email carries the current ones. */
  async enrich(content: EmailContent): Promise<EmailContent> {
    const { locationId } = content.data;
    if (typeof locationId !== 'string') return content;
    const location = await this.locations.findPublicProfile(locationId);
    return {
      ...content,
      data: {
        ...content.data,
        brandName: location.brand.name,
        brandLogoUrl: location.brand.logoFile?.url ?? null,
        locationAddress:
          [location.city, location.addressLine].filter(Boolean).join(', ') ||
          null,
        locationPhone: location.phone,
      },
    };
  }

  /** Throws when the data does not fit the template: retrying the same data cannot help. */
  render({ template, to, data }: EmailContent): ComposedEmail {
    const sender = resolveEmailSender(template, data, this.mailboxes);
    return {
      to,
      from: sender.address,
      replyTo: sender.replyTo,
      ...this.renderer.render(template, data),
    };
  }

  /** Hands the email to SMTP; resolves with the `Message-ID` the server accepted. */
  async transmit(email: ComposedEmail): Promise<string | null> {
    const info: { messageId?: string } = await this.transporter(
      email.from,
    ).sendMail({
      from: { name: email.senderName, address: email.from },
      to: email.to,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      subject: email.subject,
      html: email.html,
      attachments: email.attachments,
    });
    this.logger.log(
      `[EMAIL] subject="${email.subject}" from=${email.from} to=${email.to}`,
    );
    return info.messageId ?? null;
  }

  /** The email as the recipient sees it, with inline images embedded for a browser. */
  async preview(content: EmailContent): Promise<EmailPreview> {
    const email = await this.compose(content);
    let html = email.html;
    for (const attachment of email.attachments ?? []) {
      if (!attachment.cid || !Buffer.isBuffer(attachment.content)) continue;
      html = html.replaceAll(
        `cid:${attachment.cid}`,
        `data:${attachment.contentType ?? 'application/octet-stream'};base64,${attachment.content.toString('base64')}`,
      );
    }
    return { subject: email.subject, html };
  }

  /** Created on first use and reused; same server and password for every mailbox. */
  private transporter(address: string): Transporter {
    let transporter = this.transporters.get(address);
    if (!transporter) {
      transporter = createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpPort === IMPLICIT_TLS_PORT,
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
        auth: { user: address, pass: this.config.emailPw },
      });
      this.transporters.set(address, transporter);
    }
    return transporter;
  }
}

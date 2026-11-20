import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailAudience,
  EmailDeliveryMode,
  EmailMessage,
  EmailSkipReason,
  EmailStatus,
} from '@prisma/client';
import { INotificationsConfig } from '../../../config/interfaces/notifications-config.interface.js';
import { EmailChannel } from '../channels/email/email.channel.js';
import { emailRetryDelaySeconds } from '../constants/email-queue.constants.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { ComposedEmail } from '../interfaces/composed-email.interface.js';
import { DirectEmailResult } from '../interfaces/direct-email-result.interface.js';
import { EmailContent } from '../interfaces/email-content.interface.js';
import { EmailErrorDetails } from '../interfaces/email-error-details.interface.js';
import { EmailJobContext } from '../interfaces/email-job-context.interface.js';
import { EmailMessageMeta } from '../interfaces/email-message-meta.interface.js';
import { TERMINAL_STATUSES } from '../rules/email-actions.rules.js';
import { classifyEmailError } from '../utils/classify-email-error.js';
import { EmailLogService } from './email-log.service.js';

const INTERRUPTED: EmailErrorDetails = {
  message: 'Delivery attempt was interrupted: the server stopped mid-send',
  code: null,
  permanent: true,
};

/** Sends logged emails: one attempt per queue job, or once for a direct email. */
@Injectable()
export class EmailDeliveryService {
  private readonly logger = new Logger(EmailDeliveryService.name);
  readonly clientNotificationsEnabled: boolean;

  constructor(
    private readonly log: EmailLogService,
    private readonly channel: EmailChannel,
    config: ConfigService,
  ) {
    this.clientNotificationsEnabled = config.get<INotificationsConfig>(
      'notificationsConfig',
    )!.clientNotificationsEnabled;
  }

  isMuted(audience: EmailAudience): boolean {
    return (
      audience === EmailAudience.CLIENT && !this.clientNotificationsEnabled
    );
  }

  /**
   * One attempt of a queued email. Throws only to have pg-boss retry: a permanent error or the
   * last attempt marks the email failed and completes the job.
   */
  async process(messageId: string, job: EmailJobContext): Promise<void> {
    const message = await this.log.find(messageId);
    // A job of an earlier round (the email was retried, cancelled or sent meanwhile) does nothing.
    if (
      !message ||
      message.jobId !== job.jobId ||
      TERMINAL_STATUSES.includes(message.status)
    )
      return;
    if (this.isMuted(message.audience))
      return this.log.markSkipped(
        message.id,
        EmailSkipReason.CLIENT_NOTIFICATIONS_DISABLED,
      );
    if (message.validUntil && message.validUntil <= new Date())
      return this.log.markSkipped(message.id, EmailSkipReason.OUTDATED);

    const attempt = message.attempts + 1;
    if (!(await this.log.startAttempt(message.id, job.jobId, attempt))) return;

    const started = Date.now();
    let email: ComposedEmail | null = null;
    try {
      email = await this.compose(this.content(message));
      const providerMessageId = await this.channel.transmit(email);
      await this.log.markSent(
        message.id,
        attempt,
        { subject: email.subject, providerMessageId },
        Date.now() - started,
      );
    } catch (error) {
      const failure = {
        attempt,
        error: classifyEmailError(error),
        durationMs: Date.now() - started,
        smtp: email !== null,
      };
      this.logger.warn(
        `Email attempt failed: messageId=${message.id} template=${message.template} attempt=${attempt}${failure.error.permanent ? ' permanent' : ''}: ${failure.error.message}`,
      );
      if (failure.error.permanent || job.lastAttempt) {
        await this.log.markFailed(message.id, failure, email?.subject ?? null);
        return;
      }
      await this.log.markRetrying(
        message.id,
        failure,
        new Date(Date.now() + emailRetryDelaySeconds(job.attempt) * 1000),
        email?.subject ?? null,
      );
      throw error;
    }
  }

  /** pg-boss gave up on the job outside the worker (an attempt cut off by a restart). */
  async abandon(messageId: string, jobId: string | null): Promise<void> {
    const message = await this.log.find(messageId);
    if (
      !message ||
      message.jobId !== jobId ||
      TERMINAL_STATUSES.includes(message.status)
    )
      return;
    await this.log.markFailed(message.id, { error: INTERRUPTED }, null);
  }

  /** Sends once without the queue. The content is logged only when `storePayload` is set. */
  async sendDirect(
    content: EmailContent,
    meta: EmailMessageMeta,
    storePayload = false,
  ): Promise<DirectEmailResult> {
    const message = await this.log
      .create(
        {
          content,
          audience: meta.audience,
          reference: meta.reference,
          deliveryMode: EmailDeliveryMode.DIRECT,
          status: EmailStatus.SENDING,
        },
        undefined,
        storePayload,
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to log a direct email: template=${content.template}`,
          error instanceof Error ? error.stack : String(error),
        );
        return null;
      });
    const started = Date.now();
    let email: ComposedEmail | null = null;
    try {
      email = await this.compose(content);
      const providerMessageId = await this.channel.transmit(email);
      const durationMs = Date.now() - started;
      if (message)
        await this.log
          .markSent(
            message.id,
            1,
            { subject: email.subject, providerMessageId },
            durationMs,
          )
          .catch(() => undefined);
      return {
        messageId: message?.id ?? null,
        sent: true,
        providerMessageId,
        durationMs,
        error: null,
      };
    } catch (error) {
      const details = classifyEmailError(error);
      const durationMs = Date.now() - started;
      this.logger.warn(
        `Direct email failed: template=${content.template}: ${details.message}`,
      );
      if (message)
        await this.log
          .markFailed(
            message.id,
            { attempt: 1, error: details, durationMs, smtp: email !== null },
            email?.subject ?? null,
          )
          .catch(() => undefined);
      return {
        messageId: message?.id ?? null,
        sent: false,
        providerMessageId: null,
        durationMs,
        error: details,
      };
    }
  }

  content(message: EmailMessage): EmailContent {
    return {
      template: message.template as EmailTemplate,
      to: message.recipient,
      data: (message.payload ?? {}) as Record<string, unknown>,
    };
  }

  private async compose(content: EmailContent): Promise<ComposedEmail> {
    const enriched = await this.channel.enrich(content);
    try {
      return this.channel.render(enriched);
    } catch (error) {
      // A broken template fails the same way every time.
      throw Object.assign(
        error instanceof Error ? error : new Error(String(error)),
        { renderError: true },
      );
    }
  }
}

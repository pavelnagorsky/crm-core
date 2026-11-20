import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailAudience, EmailCancelReason, EmailMessage } from '@prisma/client';
import { IMailerConfig } from '../../../config/interfaces/mailer-config.interface.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BrandService } from '../../brand/services/brand.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { UserService } from '../../user/services/user.service.js';
import { DEFAULT_ADMIN_TIMEZONE } from '../constants/email-admin.constants.js';
import {
  EMAIL_BULK_LIMIT,
  EMAIL_LOG_RETENTION_DAYS,
  EMAIL_MAX_ATTEMPTS,
  EMAIL_WORKER_CONCURRENCY,
  emailRetryDelaySeconds,
} from '../constants/email-queue.constants.js';
import { EmailBulkRequestDto } from '../dto/email-bulk-request.dto.js';
import { EmailOverviewRequestDto } from '../dto/email-overview-request.dto.js';
import { EmailSearchRequestDto } from '../dto/email-search-request.dto.js';
import { EmailSettings } from '../interfaces/email-settings.interface.js';
import { EmailTestRequestDto } from '../dto/email-test-request.dto.js';
import { DirectEmailResult } from '../interfaces/direct-email-result.interface.js';
import { EmailFilter } from '../interfaces/email-filter.interface.js';
import { EmailMessageLookups } from '../interfaces/email-message-lookups.interface.js';
import { EmailOverview } from '../interfaces/email-overview.interface.js';
import { EmailPreview } from '../interfaces/email-preview.interface.js';
import { SmtpTestNotification } from '../messages/smtp-test.notification.js';
import {
  emailRetryBlock,
  isEmailCancellable,
} from '../rules/email-actions.rules.js';
import { EmailChannel } from '../channels/email/email.channel.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EmailLogService } from './email-log.service.js';
import { EmailOutboxService } from './email-outbox.service.js';
import { EmailQueueService } from './email-queue.service.js';
import { EmailStatsService } from './email-stats.service.js';

/** The platform admin side of the delivery log. */
@Injectable()
export class EmailAdminService {
  private readonly mailer: IMailerConfig;

  constructor(
    private readonly log: EmailLogService,
    private readonly stats: EmailStatsService,
    private readonly outbox: EmailOutboxService,
    private readonly delivery: EmailDeliveryService,
    private readonly queue: EmailQueueService,
    private readonly channel: EmailChannel,
    private readonly brands: BrandService,
    private readonly locations: LocationService,
    private readonly users: UserService,
    config: ConfigService,
  ) {
    this.mailer = config.get<IMailerConfig>('emailConfig')!;
  }

  overview(dto: EmailOverviewRequestDto): Promise<EmailOverview> {
    return this.stats.overview(dto.period, dto.timezone, this.queue.ready);
  }

  settings(): EmailSettings {
    let retrySeconds = 0;
    for (let attempt = 1; attempt < EMAIL_MAX_ATTEMPTS; attempt++)
      retrySeconds += emailRetryDelaySeconds(attempt);
    return {
      clientNotificationsEnabled: this.delivery.clientNotificationsEnabled,
      sender: this.mailer.email,
      smtpHost: this.mailer.smtpHost,
      smtpPort: this.mailer.smtpPort,
      queueReady: this.queue.ready,
      maxAttempts: EMAIL_MAX_ATTEMPTS,
      retryWindowMinutes: Math.round(retrySeconds / 60),
      workerConcurrency: EMAIL_WORKER_CONCURRENCY,
      retentionDays: EMAIL_LOG_RETENTION_DAYS,
    };
  }

  async search(dto: EmailSearchRequestDto) {
    const page = await this.log.search(dto);
    return { ...page, lookups: await this.lookups(page.items) };
  }

  countByStatus(filter: EmailFilter) {
    return this.log.countByStatus(filter);
  }

  async details(id: string) {
    const message = await this.get(id);
    const events = await this.log.findEvents(id);
    const actorIds = [
      message.retriedById,
      message.cancelledById,
      ...events.map((event) => event.actorId),
    ].filter((actorId): actorId is string => actorId !== null);
    return {
      message,
      events,
      lookups: await this.lookups([message], actorIds),
    };
  }

  async preview(id: string): Promise<EmailPreview> {
    const message = await this.get(id);
    if (message.payload === null)
      throw new AppException(
        ErrorCode.EMAIL_PREVIEW_UNAVAILABLE,
        HttpStatus.CONFLICT,
      );
    return this.channel.preview(this.delivery.content(message));
  }

  async retry(id: string, actorId: string) {
    const message = await this.get(id);
    const block = emailRetryBlock(
      message,
      this.delivery.clientNotificationsEnabled,
      new Date(),
    );
    if (block)
      throw new AppException(
        ErrorCode.EMAIL_RETRY_UNAVAILABLE,
        HttpStatus.CONFLICT,
        { reason: block },
      );
    await this.outbox.retry([message], actorId);
    return this.reload(id);
  }

  async retryMany(dto: EmailBulkRequestDto, actorId: string) {
    const { retried, skipped } = await this.outbox.retry(
      await this.selection(dto),
      actorId,
    );
    return { affected: retried, skipped };
  }

  async cancel(id: string, actorId: string) {
    const message = await this.get(id);
    if (!isEmailCancellable(message))
      throw new AppException(
        ErrorCode.EMAIL_CANCEL_UNAVAILABLE,
        HttpStatus.CONFLICT,
      );
    await this.log.cancel([id], EmailCancelReason.ADMIN, actorId);
    return this.reload(id);
  }

  async cancelMany(dto: EmailBulkRequestDto, actorId: string) {
    const selected = await this.selection(dto);
    const affected = selected.length
      ? await this.log.cancel(
          selected.map((message) => message.id),
          EmailCancelReason.ADMIN,
          actorId,
        )
      : 0;
    return { affected, skipped: selected.length - affected };
  }

  /** Sends now, bypassing the queue, so the admin sees the SMTP answer. */
  testSmtp(dto: EmailTestRequestDto): Promise<DirectEmailResult> {
    const notification = new SmtpTestNotification(
      dto.to,
      new Date(),
      dto.timezone ?? DEFAULT_ADMIN_TIMEZONE,
    );
    return this.delivery.sendDirect(
      { template: notification.emailTemplate, ...notification.toEmail() },
      { audience: EmailAudience.ACCOUNT, reference: {} },
      true,
    );
  }

  private async reload(id: string) {
    const message = await this.get(id);
    return { message, lookups: await this.lookups([message]) };
  }

  private async get(id: string): Promise<EmailMessage> {
    const message = await this.log.find(id);
    if (!message) throw new NotFoundException('Email not found');
    return message;
  }

  private selection(dto: EmailBulkRequestDto): Promise<EmailMessage[]> {
    if (dto.ids?.length) return this.log.findMany(dto.ids);
    return this.log.findMatching(dto.filter ?? {}, EMAIL_BULK_LIMIT);
  }

  private async lookups(
    messages: EmailMessage[],
    actorIds: string[] = [],
  ): Promise<EmailMessageLookups> {
    const ids = (pick: (message: EmailMessage) => string | null) =>
      messages.map(pick).filter((id): id is string => id !== null);
    const [brandNames, locationNames, actors] = await Promise.all([
      this.brands.findNames(ids((message) => message.brandId)),
      this.locations.findNames(ids((message) => message.locationId)),
      this.users.findAccessParticipants(actorIds),
    ]);
    return {
      brandNames,
      locationNames,
      actorNames: new Map(
        actors.map((actor) => [
          actor.id,
          [actor.firstName, actor.lastName].filter(Boolean).join(' ') ||
            actor.email ||
            actor.id,
        ]),
      ),
      clientNotificationsEnabled: this.delivery.clientNotificationsEnabled,
      now: new Date(),
    };
  }
}

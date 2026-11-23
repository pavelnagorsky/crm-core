import { Injectable, Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { ExclusiveCron } from '../../../shared/cron/decorators/exclusive-cron.decorator.js';
import {
  EmailDeliveryMode,
  EmailMessage,
  EmailSkipReason,
  EmailStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../../database/database.service.js';
import { LocationService } from '../../location/services/location.service.js';
import {
  EMAIL_LOG_RETENTION_DAYS,
  EMAIL_ORPHAN_AFTER_MS,
} from '../constants/email-queue.constants.js';
import { EmailContent } from '../interfaces/email-content.interface.js';
import { EmailMessageMeta } from '../interfaces/email-message-meta.interface.js';
import { EmailReference } from '../interfaces/email-reference.interface.js';
import { emailRetryBlock } from '../rules/email-actions.rules.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EmailLogService } from './email-log.service.js';
import { EmailQueueService } from './email-queue.service.js';

const ORPHAN_BATCH = 100;
const DAY_MS = 24 * 60 * 60_000;

/** Puts logged emails into the queue: new ones, retried ones and ones the queue missed. */
@Injectable()
export class EmailOutboxService {
  private readonly logger = new Logger(EmailOutboxService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly log: EmailLogService,
    private readonly queue: EmailQueueService,
    private readonly delivery: EmailDeliveryService,
    private readonly locations: LocationService,
  ) {}

  /**
   * Logs the email and queues it. Inside `tx` both happen only if the transaction commits. While
   * the queue is down the email is logged without a job and handed over once it is back.
   */
  async enqueue(
    content: EmailContent,
    meta: EmailMessageMeta,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailMessage> {
    const reference = await this.withBrand(meta.reference);
    const muted = this.delivery.isMuted(meta.audience);
    const write = async (db: Prisma.TransactionClient) => {
      const jobId = !muted && this.queue.ready ? randomUUID() : null;
      const message = await this.log.create(
        {
          content,
          audience: meta.audience,
          reference,
          deliveryMode: EmailDeliveryMode.QUEUED,
          status: muted ? EmailStatus.SKIPPED : EmailStatus.QUEUED,
          ...(muted
            ? { skipReason: EmailSkipReason.CLIENT_NOTIFICATIONS_DISABLED }
            : {}),
          jobId,
        },
        db,
      );
      if (jobId) await this.queue.send([{ messageId: message.id, jobId }], db);
      return message;
    };
    const message = await (tx ? write(tx) : this.db.$transaction(write));
    this.logger.log(
      `email ${muted ? 'skipped (client notifications disabled)' : 'queued'}: messageId=${message.id} template=${content.template}${tx ? ' (in transaction)' : ''}`,
    );
    return message;
  }

  /** Queues the emails again with fresh attempts; the rest are left as they are. */
  async retry(
    messages: EmailMessage[],
    actorId: string,
  ): Promise<{ retried: number; skipped: number }> {
    const now = new Date();
    const retryable = messages.filter(
      (message) =>
        emailRetryBlock(
          message,
          this.delivery.clientNotificationsEnabled,
          now,
        ) === null,
    );
    if (retryable.length) {
      const ready = this.queue.ready;
      await this.db.$transaction(async (tx) => {
        const jobs = retryable.map((message) => ({
          messageId: message.id,
          jobId: randomUUID(),
        }));
        for (const job of jobs)
          await this.log.requeue(
            job.messageId,
            ready ? job.jobId : null,
            actorId,
            tx,
          );
        if (ready) await this.queue.send(jobs, tx);
      });
    }
    this.logger.log(
      `emails retried: count=${retryable.length} skipped=${messages.length - retryable.length} actorId=${actorId}`,
    );
    return {
      retried: retryable.length,
      skipped: messages.length - retryable.length,
    };
  }

  /** Hands over emails logged while the queue was down, or retried then. */
  @ExclusiveCron(CronExpression.EVERY_MINUTE)
  async dispatchOrphans(): Promise<void> {
    if (!this.queue.ready) return;
    const orphans = await this.log.findOrphans(
      new Date(Date.now() - EMAIL_ORPHAN_AFTER_MS),
      ORPHAN_BATCH,
    );
    let dispatched = 0;
    for (const message of orphans) {
      const jobId = randomUUID();
      await this.db
        .$transaction(async (tx) => {
          if (await this.log.assignJob(message.id, jobId, tx)) {
            await this.queue.send([{ messageId: message.id, jobId }], tx);
            dispatched++;
          }
        })
        .catch((error: unknown) =>
          this.logger.error(
            `Failed to queue a waiting email: messageId=${message.id}`,
            error instanceof Error ? error.stack : String(error),
          ),
        );
    }
    if (dispatched)
      this.logger.log(`waiting emails queued: count=${dispatched}`);
  }

  @ExclusiveCron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeOld(): Promise<void> {
    const count = await this.log.deleteQueuedBefore(
      new Date(Date.now() - EMAIL_LOG_RETENTION_DAYS * DAY_MS),
    );
    if (count)
      this.logger.log(`old emails removed from the log: count=${count}`);
  }

  /** Location emails are listed under their brand too. */
  private async withBrand(reference: EmailReference): Promise<EmailReference> {
    if (reference.brandId || !reference.locationId) return reference;
    const location = await this.locations
      .getBookingSettings(reference.locationId)
      .catch(() => null);
    return { ...reference, brandId: location?.brandId ?? null };
  }
}

import { Injectable } from '@nestjs/common';
import {
  EmailAudience,
  EmailCancelReason,
  EmailEventType,
  EmailMessage,
  EmailMessageEvent,
  EmailSkipReason,
  EmailStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { EmailSearchRequestDto } from '../dto/email-search-request.dto.js';
import { EmailMessageOrderBy } from '../enums/email-message-order-by.enum.js';
import { EmailAttemptFailure } from '../interfaces/email-attempt-failure.interface.js';
import { EmailDeliveryResult } from '../interfaces/email-delivery-result.interface.js';
import { EmailFilter } from '../interfaces/email-filter.interface.js';
import { NewEmailMessage } from '../interfaces/new-email-message.interface.js';
import {
  CANCELLABLE_STATUSES,
  TERMINAL_STATUSES,
} from '../rules/email-actions.rules.js';
import { emailFilterWhere } from '../utils/email-filter-where.js';

type Db = Prisma.TransactionClient;

const OPEN_STATUSES: EmailStatus[] = [
  EmailStatus.QUEUED,
  EmailStatus.SENDING,
  EmailStatus.RETRYING,
];

/** The delivery log: owns `EmailMessage` and `EmailMessageEvent`. */
@Injectable()
export class EmailLogService {
  constructor(private readonly db: DatabaseService) {}

  async create(
    input: NewEmailMessage,
    tx: Db = this.db,
    storePayload = true,
  ): Promise<EmailMessage> {
    const { content, reference } = input;
    return tx.emailMessage.create({
      data: {
        template: content.template,
        audience: input.audience,
        deliveryMode: input.deliveryMode,
        recipient: content.to,
        brandId: reference.brandId ?? null,
        locationId: reference.locationId ?? null,
        bookingId: reference.bookingId ?? null,
        validUntil: reference.validUntil ?? null,
        payload: storePayload
          ? (JSON.parse(JSON.stringify(content.data)) as Prisma.InputJsonObject)
          : Prisma.DbNull,
        status: input.status,
        skipReason: input.skipReason ?? null,
        jobId: input.jobId ?? null,
        events: {
          create: {
            type:
              input.status === EmailStatus.SKIPPED
                ? EmailEventType.SKIPPED
                : EmailEventType.QUEUED,
          },
        },
      },
    });
  }

  find(id: string): Promise<EmailMessage | null> {
    return this.db.emailMessage.findUnique({ where: { id } });
  }

  /** Claims the email for the attempt of `jobId`; false when another job or an admin got there first. */
  async startAttempt(
    id: string,
    jobId: string,
    attempt: number,
  ): Promise<boolean> {
    const { count } = await this.db.emailMessage.updateMany({
      where: { id, jobId, status: { in: OPEN_STATUSES } },
      data: {
        status: EmailStatus.SENDING,
        attempts: attempt,
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
      },
    });
    return count === 1;
  }

  async markSent(
    id: string,
    attempt: number,
    result: EmailDeliveryResult,
    durationMs: number,
  ): Promise<void> {
    await this.db.$transaction([
      this.db.emailMessage.update({
        where: { id },
        data: {
          status: EmailStatus.SENT,
          attempts: attempt,
          sentAt: new Date(),
          subject: result.subject,
          providerMessageId: result.providerMessageId,
          lastError: null,
          lastErrorCode: null,
          nextAttemptAt: null,
        },
      }),
      this.event(id, EmailEventType.SENT, { attempt, durationMs }),
    ]);
  }

  async markRetrying(
    id: string,
    failure: EmailAttemptFailure,
    nextAttemptAt: Date,
    subject: string | null,
  ): Promise<void> {
    await this.db.$transaction([
      this.db.emailMessage.update({
        where: { id },
        data: {
          status: EmailStatus.RETRYING,
          lastError: failure.error.message,
          lastErrorCode: failure.error.code,
          nextAttemptAt,
          ...(subject ? { subject } : {}),
        },
      }),
      this.event(id, EmailEventType.ATTEMPT_FAILED, {
        attempt: failure.attempt,
        durationMs: failure.durationMs,
        error: failure.error.message,
        errorCode: failure.error.code,
        smtpError: failure.smtp,
      }),
    ]);
  }

  async markFailed(
    id: string,
    failure: EmailAttemptFailure | { error: EmailAttemptFailure['error'] },
    subject: string | null,
  ): Promise<void> {
    const attempt = 'attempt' in failure ? failure : null;
    await this.db.$transaction([
      this.db.emailMessage.update({
        where: { id },
        data: {
          status: EmailStatus.FAILED,
          ...(attempt ? { attempts: attempt.attempt } : {}),
          failedAt: new Date(),
          lastError: failure.error.message,
          lastErrorCode: failure.error.code,
          nextAttemptAt: null,
          ...(subject ? { subject } : {}),
        },
      }),
      this.event(id, EmailEventType.FAILED, {
        attempt: attempt?.attempt ?? null,
        durationMs: attempt?.durationMs ?? null,
        error: failure.error.message,
        errorCode: failure.error.code,
        smtpError: attempt?.smtp ?? false,
      }),
    ]);
  }

  async markSkipped(id: string, reason: EmailSkipReason): Promise<void> {
    await this.db.$transaction([
      this.db.emailMessage.update({
        where: { id },
        data: {
          status: EmailStatus.SKIPPED,
          skipReason: reason,
          nextAttemptAt: null,
        },
      }),
      this.event(id, EmailEventType.SKIPPED),
    ]);
  }

  /** Hands the email to a new job with a fresh set of attempts; without a job the orphan pass queues it. */
  async requeue(
    id: string,
    jobId: string | null,
    actorId: string,
    tx: Db,
  ): Promise<void> {
    await tx.emailMessage.update({
      where: { id },
      data: {
        status: EmailStatus.QUEUED,
        jobId,
        retriedAt: new Date(),
        retriedById: actorId,
        nextAttemptAt: null,
        skipReason: null,
        cancelReason: null,
        cancelledAt: null,
        cancelledById: null,
      },
    });
    await tx.emailMessageEvent.create({
      data: { messageId: id, type: EmailEventType.RETRY_REQUESTED, actorId },
    });
  }

  /** Gives a job to a queued email that has none; false when it got one meanwhile. */
  async assignJob(id: string, jobId: string, tx: Db): Promise<boolean> {
    const { count } = await tx.emailMessage.updateMany({
      where: { id, jobId: null, status: EmailStatus.QUEUED },
      data: { jobId },
    });
    return count === 1;
  }

  /** Cancels the ones still waiting or failed; returns how many. */
  async cancel(
    ids: string[],
    reason: EmailCancelReason,
    actorId: string | null,
    tx?: Db,
  ): Promise<number> {
    const run = async (db: Db) => {
      const rows = await db.emailMessage.findMany({
        where: { id: { in: ids }, status: { in: CANCELLABLE_STATUSES } },
        select: { id: true },
      });
      if (!rows.length) return 0;
      const cancelled = rows.map((row) => row.id);
      await db.emailMessage.updateMany({
        where: { id: { in: cancelled }, status: { in: CANCELLABLE_STATUSES } },
        data: {
          status: EmailStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: new Date(),
          cancelledById: actorId,
          nextAttemptAt: null,
        },
      });
      await db.emailMessageEvent.createMany({
        data: cancelled.map((messageId) => ({
          messageId,
          type: EmailEventType.CANCELLED,
          actorId,
        })),
      });
      return cancelled.length;
    };
    return tx ? run(tx) : this.db.$transaction(run);
  }

  async findPendingClientIds(bookingId: string, tx: Db): Promise<string[]> {
    const rows = await tx.emailMessage.findMany({
      where: {
        bookingId,
        audience: EmailAudience.CLIENT,
        status: { in: CANCELLABLE_STATUSES },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Queued emails that never got a job (the queue was down when they were written). */
  findOrphans(queuedBefore: Date, take: number): Promise<EmailMessage[]> {
    return this.db.emailMessage.findMany({
      where: {
        status: EmailStatus.QUEUED,
        jobId: null,
        queuedAt: { lt: queuedBefore },
      },
      orderBy: { queuedAt: 'asc' },
      take,
    });
  }

  async deleteQueuedBefore(before: Date): Promise<number> {
    const { count } = await this.db.emailMessage.deleteMany({
      where: { queuedAt: { lt: before }, status: { in: TERMINAL_STATUSES } },
    });
    return count;
  }

  async search(
    dto: EmailSearchRequestDto,
  ): Promise<PaginatedResult<EmailMessage>> {
    const where = emailFilterWhere(dto);
    const direction =
      dto.orderDirection === OrderDirection.ASC
        ? OrderDirection.ASC
        : OrderDirection.DESC;
    const orderBy: Prisma.EmailMessageOrderByWithRelationInput[] = [
      dto.orderBy === EmailMessageOrderBy.SENT_AT
        ? { sentAt: { sort: direction, nulls: 'last' } }
        : dto.orderBy === EmailMessageOrderBy.ATTEMPTS
          ? { attempts: direction }
          : { queuedAt: direction },
      { id: direction },
    ];
    const [items, totalItems] = await Promise.all([
      this.db.emailMessage.findMany({
        where,
        orderBy,
        ...(dto.isExport
          ? {}
          : { skip: (dto.page - 1) * dto.pageSize, take: dto.pageSize }),
      }),
      this.db.emailMessage.count({ where }),
    ]);
    return { items, totalItems };
  }

  /** Emails per status for the list tabs: every filter except the status. */
  async countByStatus(filter: EmailFilter): Promise<Map<EmailStatus, number>> {
    const rows = await this.db.emailMessage.groupBy({
      by: ['status'],
      where: emailFilterWhere(filter, false),
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.status, row._count._all]));
  }

  findMany(ids: string[]): Promise<EmailMessage[]> {
    return this.db.emailMessage.findMany({ where: { id: { in: ids } } });
  }

  findMatching(filter: EmailFilter, take: number): Promise<EmailMessage[]> {
    return this.db.emailMessage.findMany({
      where: emailFilterWhere(filter),
      orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  findEvents(messageId: string): Promise<EmailMessageEvent[]> {
    return this.db.emailMessageEvent.findMany({
      where: { messageId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }

  countByStatusOnly(status: EmailStatus): Promise<number> {
    return this.db.emailMessage.count({ where: { status } });
  }

  private event(
    messageId: string,
    type: EmailEventType,
    data: Omit<
      Prisma.EmailMessageEventUncheckedCreateInput,
      'messageId' | 'type'
    > = {},
  ) {
    return this.db.emailMessageEvent.create({
      data: { messageId, type, ...data },
    });
  }
}

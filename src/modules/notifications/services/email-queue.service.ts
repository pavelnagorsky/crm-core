import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fromPrisma, JobWithMetadata } from 'pg-boss';
import { JobQueueService } from '../../../shared/queue/job-queue.service.js';
import {
  EMAIL_DEAD_LETTER_OPTIONS,
  EMAIL_DEAD_LETTER_QUEUE,
  EMAIL_QUEUE,
  EMAIL_QUEUE_OPTIONS,
  EMAIL_WORKER_CONCURRENCY,
} from '../constants/email-queue.constants.js';
import { EmailJobData } from '../interfaces/email-job-data.interface.js';
import { EmailDeliveryService } from './email-delivery.service.js';

/** pg-boss transport of the delivery log: a job only says which logged email to send. */
@Injectable()
export class EmailQueueService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EmailQueueService.name);
  private working = false;

  constructor(
    private readonly jobQueue: JobQueueService,
    private readonly delivery: EmailDeliveryService,
  ) {}

  get ready(): boolean {
    return this.jobQueue.ready;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.jobQueue.onReady(async (boss) => {
      await boss.createQueue(
        EMAIL_DEAD_LETTER_QUEUE,
        EMAIL_DEAD_LETTER_OPTIONS,
      );
      await boss.updateQueue(
        EMAIL_DEAD_LETTER_QUEUE,
        EMAIL_DEAD_LETTER_OPTIONS,
      );
      const options = {
        ...EMAIL_QUEUE_OPTIONS,
        deadLetter: EMAIL_DEAD_LETTER_QUEUE,
      };
      await boss.createQueue(EMAIL_QUEUE, options);
      // createQueue leaves an existing queue as it was; this applies changed options.
      await boss.updateQueue(EMAIL_QUEUE, options);
      await boss.work(
        EMAIL_QUEUE,
        { localConcurrency: EMAIL_WORKER_CONCURRENCY, includeMetadata: true },
        async ([job]: JobWithMetadata<EmailJobData>[]) =>
          this.delivery.process(job.data.messageId, {
            jobId: job.id,
            attempt: job.retryCount + 1,
            lastAttempt: job.retryCount >= job.retryLimit,
          }),
      );
      await boss.work(
        EMAIL_DEAD_LETTER_QUEUE,
        { includeMetadata: true },
        async ([job]: JobWithMetadata<EmailJobData>[]) =>
          this.delivery.abandon(job.data.messageId, job.sourceId),
      );
      this.working = true;
      this.logger.log('Email workers started');
    });
  }

  /** Lets emails being sent finish while the database is still connected. */
  async onModuleDestroy(): Promise<void> {
    if (!this.working) return;
    this.working = false;
    await this.jobQueue.boss.offWork(EMAIL_QUEUE, { wait: true });
    await this.jobQueue.boss.offWork(EMAIL_DEAD_LETTER_QUEUE, { wait: true });
  }

  /** Jobs exist only if `tx` commits. */
  async send(
    jobs: { messageId: string; jobId: string }[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!jobs.length) return;
    await this.jobQueue.boss.insert(
      EMAIL_QUEUE,
      jobs.map((job) => ({
        id: job.jobId,
        data: { messageId: job.messageId } satisfies EmailJobData,
      })),
      { db: fromPrisma(tx) },
    );
  }
}

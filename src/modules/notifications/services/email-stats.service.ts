import { Injectable } from '@nestjs/common';
import { EmailEventType, EmailStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { emailHealth } from '../calculators/email-health.calculator.js';
import { EmailOverviewPeriod } from '../enums/email-overview-period.enum.js';
import { EmailSeriesBucket } from '../enums/email-series-bucket.enum.js';
import { EmailOverview } from '../interfaces/email-overview.interface.js';

const PERIOD_BUCKETS: Record<
  EmailOverviewPeriod,
  { bucket: EmailSeriesBucket; count: number }
> = {
  [EmailOverviewPeriod.DAY]: { bucket: EmailSeriesBucket.HOUR, count: 24 },
  [EmailOverviewPeriod.WEEK]: { bucket: EmailSeriesBucket.DAY, count: 7 },
  [EmailOverviewPeriod.MONTH]: { bucket: EmailSeriesBucket.DAY, count: 30 },
};
const HEALTH_WINDOW_MS = 24 * 60 * 60_000;
const HEALTH_SAMPLE = 20;
const TOP_ERRORS = 5;
const ERROR_GROUP_LENGTH = 300;
const OPEN: EmailStatus[] = [
  EmailStatus.QUEUED,
  EmailStatus.SENDING,
  EmailStatus.RETRYING,
];

/** Read-only reports over the delivery log for the admin overview. */
@Injectable()
export class EmailStatsService {
  constructor(private readonly db: DatabaseService) {}

  /** The period ends now and starts at a bucket boundary in `timezone`, so the chart has full buckets. */
  async overview(
    period: EmailOverviewPeriod,
    timezone: string,
    queueReady: boolean,
  ): Promise<EmailOverview> {
    const { bucket, count } = PERIOD_BUCKETS[period];
    const [{ from }] = await this.db.$queryRaw<{ from: Date }[]>`
      SELECT (date_trunc(${bucket}, now() AT TIME ZONE ${timezone})
        - (${count}::int - 1) * ('1 ' || ${bucket})::interval) AT TIME ZONE ${timezone} AS "from"
    `;
    const now = new Date();
    const [
      statusRows,
      backlog,
      needsAttention,
      delivery,
      series,
      templates,
      errors,
      outcomes,
    ] = await Promise.all([
      this.db.emailMessage.groupBy({
        by: ['status'],
        where: { queuedAt: { gte: from } },
        _count: { _all: true },
      }),
      this.db.emailMessage.aggregate({
        where: { status: { in: OPEN } },
        _count: { _all: true },
        _min: { queuedAt: true },
      }),
      this.db.emailMessage.count({ where: { status: EmailStatus.FAILED } }),
      this.db.$queryRaw<{ median: number | null; p95: number | null }[]>`
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("sentAt" - "queuedAt"))) AS "median",
          percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("sentAt" - "queuedAt"))) AS "p95"
        FROM "EmailMessage"
        WHERE "sentAt" >= ${from} AND "deliveryMode" = 'QUEUED'
      `,
      this.series(from, bucket, timezone),
      this.db.$queryRaw<EmailOverview['templates']>`
        SELECT "template",
          count(*)::int AS "total",
          (count(*) FILTER (WHERE "status" = 'SENT'))::int AS "sent",
          (count(*) FILTER (WHERE "status" = 'FAILED'))::int AS "failed"
        FROM "EmailMessage"
        WHERE "queuedAt" >= ${from}
        GROUP BY "template"
        ORDER BY "total" DESC, "template"
      `,
      this.db.$queryRaw<EmailOverview['errors']>`
        SELECT left("error", ${ERROR_GROUP_LENGTH}) AS "error",
          max("errorCode") AS "errorCode",
          count(*)::int AS "count",
          max("occurredAt") AS "lastAt"
        FROM "EmailMessageEvent"
        WHERE "type" IN ('ATTEMPT_FAILED', 'FAILED')
          AND "occurredAt" >= ${from}
          AND "error" IS NOT NULL
        GROUP BY 1
        ORDER BY "count" DESC, "lastAt" DESC
        LIMIT ${TOP_ERRORS}
      `,
      // SMTP evidence only: a broken template or a deleted business says nothing about the server.
      this.db.emailMessageEvent.findMany({
        where: {
          OR: [
            { type: EmailEventType.SENT },
            {
              type: {
                in: [EmailEventType.ATTEMPT_FAILED, EmailEventType.FAILED],
              },
              smtpError: true,
            },
          ],
          occurredAt: { gte: new Date(now.getTime() - HEALTH_WINDOW_MS) },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: HEALTH_SAMPLE,
        select: { type: true, occurredAt: true, error: true },
      }),
    ]);
    const [deliverySeconds] = delivery;
    return {
      from,
      bucket,
      health: emailHealth(
        outcomes.map((event) => ({
          sent: event.type === EmailEventType.SENT,
          occurredAt: event.occurredAt,
          error: event.error,
        })),
        queueReady,
        now,
      ),
      statusCounts: new Map(
        statusRows.map((row) => [row.status, row._count._all]),
      ),
      backlog: {
        count: backlog._count._all,
        oldestQueuedAt: backlog._min.queuedAt,
      },
      needsAttention,
      deliverySeconds:
        deliverySeconds?.median == null || deliverySeconds.p95 == null
          ? null
          : {
              median: Number(deliverySeconds.median),
              p95: Number(deliverySeconds.p95),
            },
      series,
      templates,
      errors,
    };
  }

  /** One row per bucket, empty buckets included; buckets start at local boundaries of `timezone`. */
  private series(
    from: Date,
    bucket: EmailSeriesBucket,
    timezone: string,
  ): Promise<EmailOverview['series']> {
    const local = Prisma.sql`date_trunc(${bucket}, m."queuedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})`;
    return this.db.$queryRaw<EmailOverview['series']>`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${bucket}, ${from}::timestamptz AT TIME ZONE ${timezone}),
          date_trunc(${bucket}, now() AT TIME ZONE ${timezone}),
          ('1 ' || ${bucket})::interval
        ) AS "local"
      )
      SELECT b."local" AT TIME ZONE ${timezone} AS "bucketStart",
        (count(m."id") FILTER (WHERE m."status" = 'SENT'))::int AS "sent",
        (count(m."id") FILTER (WHERE m."status" = 'FAILED'))::int AS "failed",
        (count(m."id") FILTER (WHERE m."status" IN ('SKIPPED', 'CANCELLED')))::int AS "skipped",
        (count(m."id") FILTER (WHERE m."status" IN ('QUEUED', 'SENDING', 'RETRYING')))::int AS "inProgress"
      FROM buckets b
      LEFT JOIN "EmailMessage" m ON m."queuedAt" >= ${from} AND ${local} = b."local"
      GROUP BY b."local"
      ORDER BY b."local"
    `;
  }
}

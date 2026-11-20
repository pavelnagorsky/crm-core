import { ApiProperty } from '@nestjs/swagger';
import { EmailStatus } from '@prisma/client';
import { EmailOverviewPeriod } from '../enums/email-overview-period.enum.js';
import { EmailSeriesBucket } from '../enums/email-series-bucket.enum.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailOverview } from '../interfaces/email-overview.interface.js';
import { EmailBacklogDto } from './email-backlog.dto.js';
import { EmailDeliveryTimeDto } from './email-delivery-time.dto.js';
import { EmailErrorStatDto } from './email-error-stat.dto.js';
import { EmailHealthDto } from './email-health.dto.js';
import { EmailSeriesPointDto } from './email-series-point.dto.js';
import { EmailTemplateStatDto } from './email-template-stat.dto.js';
import { EmailTotalsDto } from './email-totals.dto.js';

export class EmailOverviewDto {
  @ApiProperty({ enum: EmailOverviewPeriod, enumName: 'EmailOverviewPeriod' })
  period: EmailOverviewPeriod;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Start of the period; it ends now',
  })
  from: Date;

  @ApiProperty({ enum: EmailSeriesBucket, enumName: 'EmailSeriesBucket' })
  bucket: EmailSeriesBucket;

  @ApiProperty({ type: () => EmailHealthDto })
  health: EmailHealthDto;

  @ApiProperty({ type: () => EmailTotalsDto })
  totals: EmailTotalsDto;

  @ApiProperty({ type: () => EmailBacklogDto })
  backlog: EmailBacklogDto;

  @ApiProperty({
    type: Number,
    description: 'FAILED emails in the whole log: they need an admin',
  })
  needsAttention: number;

  @ApiProperty({ type: () => EmailDeliveryTimeDto, nullable: true })
  deliveryTime: EmailDeliveryTimeDto | null;

  @ApiProperty({
    type: () => EmailSeriesPointDto,
    isArray: true,
    description:
      'Every bucket of the period, empty ones included, oldest first',
  })
  series: EmailSeriesPointDto[];

  @ApiProperty({
    type: () => EmailTemplateStatDto,
    isArray: true,
    description: 'Most frequent first',
  })
  templates: EmailTemplateStatDto[];

  @ApiProperty({
    type: () => EmailErrorStatDto,
    isArray: true,
    description: 'Up to 5, most frequent first',
  })
  errors: EmailErrorStatDto[];

  static from(
    period: EmailOverviewPeriod,
    overview: EmailOverview,
  ): EmailOverviewDto {
    const count = (...statuses: EmailStatus[]) =>
      statuses.reduce(
        (sum, status) => sum + (overview.statusCounts.get(status) ?? 0),
        0,
      );
    const sent = count(EmailStatus.SENT);
    const failed = count(EmailStatus.FAILED);
    return {
      period,
      from: overview.from,
      bucket: overview.bucket,
      health: overview.health,
      totals: {
        total: count(...Object.values(EmailStatus)),
        sent,
        failed,
        skipped: count(EmailStatus.SKIPPED, EmailStatus.CANCELLED),
        inProgress: count(
          EmailStatus.QUEUED,
          EmailStatus.SENDING,
          EmailStatus.RETRYING,
        ),
        successRate: sent + failed ? sent / (sent + failed) : null,
      },
      backlog: overview.backlog,
      needsAttention: overview.needsAttention,
      deliveryTime: overview.deliverySeconds && {
        medianSeconds: Math.round(overview.deliverySeconds.median * 10) / 10,
        p95Seconds: Math.round(overview.deliverySeconds.p95 * 10) / 10,
      },
      series: overview.series,
      templates: overview.templates.map((row) => ({
        ...row,
        template: row.template as EmailTemplate,
      })),
      errors: overview.errors.map((row) => ({
        ...row,
        errorCode: row.errorCode === null ? null : Number(row.errorCode),
      })),
    };
  }
}

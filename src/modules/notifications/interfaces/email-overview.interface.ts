import { EmailStatus } from '@prisma/client';
import { EmailSeriesBucket } from '../enums/email-series-bucket.enum.js';
import { EmailHealth } from './email-health.interface.js';

export interface EmailOverview {
  from: Date;
  bucket: EmailSeriesBucket;
  health: EmailHealth;
  statusCounts: Map<EmailStatus, number>;
  backlog: { count: number; oldestQueuedAt: Date | null };
  needsAttention: number;
  deliverySeconds: { median: number; p95: number } | null;
  series: {
    bucketStart: Date;
    sent: number;
    failed: number;
    skipped: number;
    inProgress: number;
  }[];
  templates: {
    template: string;
    total: number;
    sent: number;
    failed: number;
  }[];
  errors: {
    error: string;
    errorCode: number | null;
    count: number;
    lastAt: Date;
  }[];
}

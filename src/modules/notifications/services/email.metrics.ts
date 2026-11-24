import { Injectable } from '@nestjs/common';
import { Histogram } from 'prom-client';
import { MetricsService } from '../../../shared/metrics/metrics.service.js';
import { EmailSendResult } from '../enums/email-send-result.enum.js';

/**
 * `klendo_email_send_duration_seconds{result}`: every SMTP send, queued or direct, with its outcome. Its `_count`
 * is the number of sends, so one histogram gives the send rate, the failure share and the SMTP latency.
 */
@Injectable()
export class EmailMetrics {
  private readonly sends: Histogram<'result'>;

  constructor({ registry }: MetricsService) {
    this.sends = new Histogram({
      name: 'klendo_email_send_duration_seconds',
      help: 'SMTP sends of emails by result, with their duration.',
      labelNames: ['result'],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [registry],
    });
  }

  /** Runs `send` and accounts it, whatever its outcome; the result or error is passed through. */
  async track<T>(send: () => Promise<T>): Promise<T> {
    const end = this.sends.startTimer();
    try {
      const result = await send();
      end({ result: EmailSendResult.SENT });
      return result;
    } catch (error) {
      end({ result: EmailSendResult.FAILED });
      throw error;
    }
  }
}

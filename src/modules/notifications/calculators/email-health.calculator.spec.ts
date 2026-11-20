import { EmailHealthStatus } from '../enums/email-health-status.enum.js';
import { emailHealth } from './email-health.calculator.js';

const now = new Date('2026-11-20T12:00:00Z');
const at = (minutesAgo: number) =>
  new Date(now.getTime() - minutesAgo * 60_000);
const sent = (minutesAgo: number) => ({
  sent: true,
  occurredAt: at(minutesAgo),
  error: null,
});
const failed = (minutesAgo: number, error = '535 Authentication failed') => ({
  sent: false,
  occurredAt: at(minutesAgo),
  error,
});

describe('emailHealth', () => {
  it('is OK while the latest attempts succeed', () => {
    expect(emailHealth([sent(1), sent(5)], true, now)).toMatchObject({
      status: EmailHealthStatus.OK,
      consecutiveFailures: 0,
      lastSentAt: at(1),
    });
  });

  it('is DOWN after three failures in a row, with the latest error', () => {
    expect(
      emailHealth([failed(1), failed(2), failed(3), sent(30)], true, now),
    ).toMatchObject({
      status: EmailHealthStatus.DOWN,
      consecutiveFailures: 3,
      lastError: '535 Authentication failed',
      lastSentAt: at(30),
    });
  });

  it('is DEGRADED when a recent attempt failed but the latest went through', () => {
    expect(emailHealth([sent(1), failed(10)], true, now).status).toBe(
      EmailHealthStatus.DEGRADED,
    );
  });

  it('forgets failures older than an hour once sending works', () => {
    expect(emailHealth([sent(1), failed(120)], true, now).status).toBe(
      EmailHealthStatus.OK,
    );
  });

  it('is IDLE without attempts and DOWN when the queue is not running', () => {
    expect(emailHealth([], true, now).status).toBe(EmailHealthStatus.IDLE);
    expect(emailHealth([sent(1)], false, now).status).toBe(
      EmailHealthStatus.DOWN,
    );
  });
});

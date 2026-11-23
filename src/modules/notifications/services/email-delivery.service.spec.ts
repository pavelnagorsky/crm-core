import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import {
  EmailAudience,
  EmailMessage,
  EmailSkipReason,
  EmailStatus,
} from '@prisma/client';
import { MetricsService } from '../../../shared/metrics/metrics.service.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EmailMetrics } from './email.metrics.js';

const log = {
  find: vi.fn(),
  startAttempt: vi.fn(),
  markSent: vi.fn(),
  markRetrying: vi.fn(),
  markFailed: vi.fn(),
  markSkipped: vi.fn(),
  create: vi.fn(),
};
const channel = { enrich: vi.fn(), render: vi.fn(), transmit: vi.fn() };
const create = (clientNotificationsEnabled = true) =>
  new EmailDeliveryService(
    log as never,
    channel as never,
    new ConfigService({ notificationsConfig: { clientNotificationsEnabled } }),
    new EmailMetrics(new MetricsService()),
  );
const message = (overrides: Partial<EmailMessage> = {}): EmailMessage =>
  ({
    id: 'm1',
    template: 'booking-reminder',
    audience: EmailAudience.CLIENT,
    recipient: 'client@example.com',
    payload: { locationId: 'l1', startAt: '2099-01-01T10:00:00.000Z' },
    status: EmailStatus.QUEUED,
    attempts: 0,
    jobId: 'job-1',
    validUntil: new Date('2099-01-01T10:00:00Z'),
    ...overrides,
  }) as EmailMessage;
const job = { jobId: 'job-1', attempt: 1, lastAttempt: false };

beforeEach(() => {
  vi.resetAllMocks();
  log.startAttempt.mockResolvedValue(true);
  log.markSent.mockResolvedValue(undefined);
  log.markFailed.mockResolvedValue(undefined);
  channel.enrich.mockImplementation(async (content) => content);
  channel.render.mockReturnValue({ to: 'client@example.com', subject: 'Hi' });
  channel.transmit.mockResolvedValue('<id@smtp>');
});

describe('EmailDeliveryService.process', () => {
  it('sends and records the accepted message id', async () => {
    log.find.mockResolvedValue(message());
    await create().process('m1', job);
    expect(log.startAttempt).toHaveBeenCalledWith('m1', 'job-1', 1);
    expect(log.markSent).toHaveBeenCalledWith(
      'm1',
      1,
      { subject: 'Hi', providerMessageId: '<id@smtp>' },
      expect.any(Number),
    );
  });

  it('ignores a job of an earlier round', async () => {
    log.find.mockResolvedValue(message({ jobId: 'job-2' }));
    await create().process('m1', job);
    expect(log.startAttempt).not.toHaveBeenCalled();
    expect(channel.transmit).not.toHaveBeenCalled();
  });

  it('does nothing for a cancelled email still in the queue', async () => {
    log.find.mockResolvedValue(message({ status: EmailStatus.CANCELLED }));
    await create().process('m1', job);
    expect(channel.transmit).not.toHaveBeenCalled();
  });

  it('skips client emails muted after they were queued', async () => {
    log.find.mockResolvedValue(message());
    await create(false).process('m1', job);
    expect(log.markSkipped).toHaveBeenCalledWith(
      'm1',
      EmailSkipReason.CLIENT_NOTIFICATIONS_DISABLED,
    );
    expect(channel.transmit).not.toHaveBeenCalled();
  });

  it('skips an email about a visit that has started', async () => {
    log.find.mockResolvedValue(
      message({ validUntil: new Date('2000-01-01T00:00:00Z') }),
    );
    await create().process('m1', job);
    expect(log.markSkipped).toHaveBeenCalledWith(
      'm1',
      EmailSkipReason.OUTDATED,
    );
  });

  it('records a transient failure and rethrows so the queue retries', async () => {
    log.find.mockResolvedValue(message({ attempts: 2 }));
    channel.transmit.mockRejectedValue(
      Object.assign(new Error('Greeting never received'), {
        code: 'ETIMEDOUT',
      }),
    );
    await expect(create().process('m1', job)).rejects.toThrow('Greeting');
    expect(log.markRetrying).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({
        attempt: 3,
        error: expect.objectContaining({ permanent: false }),
      }),
      expect.any(Date),
      'Hi',
    );
    expect(log.markFailed).not.toHaveBeenCalled();
  });

  it('fails at once when the mailbox does not exist', async () => {
    log.find.mockResolvedValue(message());
    channel.transmit.mockRejectedValue(
      Object.assign(new Error('550 No such user'), { responseCode: 550 }),
    );
    await expect(create().process('m1', job)).resolves.toBeUndefined();
    expect(log.markFailed).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({
        error: expect.objectContaining({ code: 550, permanent: true }),
      }),
      'Hi',
    );
  });

  it('fails at once when the template cannot render the data', async () => {
    log.find.mockResolvedValue(message());
    channel.render.mockImplementation(() => {
      throw new Error('Brand name required for email: booking-reminder');
    });
    await expect(create().process('m1', job)).resolves.toBeUndefined();
    expect(log.markFailed).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({
        error: expect.objectContaining({ permanent: true }),
      }),
      null,
    );
  });

  it('fails at once when the business is gone', async () => {
    log.find.mockResolvedValue(message());
    channel.enrich.mockRejectedValue(new NotFoundException());
    await create().process('m1', job);
    expect(log.markFailed).toHaveBeenCalled();
  });

  it('marks the email failed after the last attempt instead of rethrowing', async () => {
    log.find.mockResolvedValue(message());
    channel.transmit.mockRejectedValue(new Error('Connection closed'));
    await expect(
      create().process('m1', { ...job, attempt: 6, lastAttempt: true }),
    ).resolves.toBeUndefined();
    expect(log.markFailed).toHaveBeenCalled();
    expect(log.markRetrying).not.toHaveBeenCalled();
  });
});

describe('EmailDeliveryService.abandon', () => {
  it('fails the email whose job pg-boss gave up on', async () => {
    log.find.mockResolvedValue(message({ status: EmailStatus.SENDING }));
    await create().abandon('m1', 'job-1');
    expect(log.markFailed).toHaveBeenCalledWith(
      'm1',
      { error: expect.objectContaining({ permanent: true }) },
      null,
    );
  });

  it('leaves an email already handed to another job', async () => {
    log.find.mockResolvedValue(message({ jobId: 'job-2' }));
    await create().abandon('m1', 'job-1');
    expect(log.markFailed).not.toHaveBeenCalled();
  });
});

describe('EmailDeliveryService.sendDirect', () => {
  it('logs the email without its content and reports the outcome', async () => {
    log.create.mockResolvedValue({ id: 'm9' });
    const result = await create().sendDirect(
      { template: 'confirm-email' as never, to: 'a@b.c', data: { code: 1 } },
      { audience: EmailAudience.ACCOUNT, reference: {} },
    );
    expect(log.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmailStatus.SENDING }),
      undefined,
      false,
    );
    expect(result).toMatchObject({ messageId: 'm9', sent: true });
  });

  it('still sends when the log cannot be written', async () => {
    log.create.mockRejectedValue(new Error('db down'));
    const result = await create().sendDirect(
      { template: 'confirm-email' as never, to: 'a@b.c', data: {} },
      { audience: EmailAudience.ACCOUNT, reference: {} },
    );
    expect(channel.transmit).toHaveBeenCalled();
    expect(result).toMatchObject({ messageId: null, sent: true });
  });
});

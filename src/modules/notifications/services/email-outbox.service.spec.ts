import {
  EmailAudience,
  EmailMessage,
  EmailSkipReason,
  EmailStatus,
} from '@prisma/client';
import { EmailOutboxService } from './email-outbox.service.js';

const tx = {};
const db = {
  $transaction: vi.fn(async (run: (t: object) => unknown) => run(tx)),
};
const log = {
  create: vi.fn(),
  requeue: vi.fn(),
  findOrphans: vi.fn(),
  assignJob: vi.fn(),
  deleteQueuedBefore: vi.fn(),
};
const queue = { ready: true, send: vi.fn() };
const delivery = {
  clientNotificationsEnabled: true,
  isMuted: vi.fn(),
};
const locations = { getBookingSettings: vi.fn() };
const service = new EmailOutboxService(
  db as never,
  log as never,
  queue as never,
  delivery as never,
  locations as never,
);
const content = {
  template: 'booking-reminder' as never,
  to: 'client@example.com',
  data: {},
};
const meta = {
  audience: EmailAudience.CLIENT,
  reference: { locationId: 'l1', bookingId: 'b1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  queue.ready = true;
  delivery.clientNotificationsEnabled = true;
  delivery.isMuted.mockReturnValue(false);
  log.create.mockImplementation(async (input) => ({ id: 'm1', ...input }));
  locations.getBookingSettings.mockResolvedValue({ brandId: 'brand-1' });
});

describe('EmailOutboxService.enqueue', () => {
  it('logs and queues in one transaction, listed under the brand', async () => {
    await service.enqueue(content, meta);
    const [input, writeTx] = log.create.mock.calls[0];
    expect(writeTx).toBe(tx);
    expect(input).toMatchObject({
      status: EmailStatus.QUEUED,
      reference: { locationId: 'l1', bookingId: 'b1', brandId: 'brand-1' },
      jobId: expect.any(String),
    });
    expect(queue.send).toHaveBeenCalledWith(
      [{ messageId: 'm1', jobId: input.jobId }],
      tx,
    );
  });

  it('joins the caller transaction', async () => {
    const callerTx = {};
    await service.enqueue(content, meta, callerTx as never);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(queue.send).toHaveBeenCalledWith(expect.any(Array), callerTx);
  });

  it('logs a muted client email as skipped without a job', async () => {
    delivery.isMuted.mockReturnValue(true);
    await service.enqueue(content, meta);
    expect(log.create.mock.calls[0][0]).toMatchObject({
      status: EmailStatus.SKIPPED,
      skipReason: EmailSkipReason.CLIENT_NOTIFICATIONS_DISABLED,
      jobId: null,
    });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it('logs the email without a job while the queue is down', async () => {
    queue.ready = false;
    await service.enqueue(content, meta);
    expect(log.create.mock.calls[0][0]).toMatchObject({
      status: EmailStatus.QUEUED,
      jobId: null,
    });
    expect(queue.send).not.toHaveBeenCalled();
  });
});

describe('EmailOutboxService.retry', () => {
  const failed = (id: string, overrides: Partial<EmailMessage> = {}) =>
    ({
      id,
      status: EmailStatus.FAILED,
      payload: {},
      audience: EmailAudience.CLIENT,
      validUntil: null,
      ...overrides,
    }) as EmailMessage;

  it('requeues the retryable ones and skips the rest', async () => {
    const result = await service.retry(
      [
        failed('m1'),
        failed('m2', { validUntil: new Date('2000-01-01') }),
        failed('m3', { payload: null }),
      ],
      'admin-1',
    );
    expect(result).toEqual({ retried: 1, skipped: 2 });
    expect(log.requeue).toHaveBeenCalledExactlyOnceWith(
      'm1',
      expect.any(String),
      'admin-1',
      tx,
    );
    expect(queue.send).toHaveBeenCalledWith(
      [{ messageId: 'm1', jobId: expect.any(String) }],
      tx,
    );
  });

  it('leaves retried emails for the orphan pass while the queue is down', async () => {
    queue.ready = false;
    await service.retry([failed('m1')], 'admin-1');
    expect(log.requeue).toHaveBeenCalledWith('m1', null, 'admin-1', tx);
    expect(queue.send).not.toHaveBeenCalled();
  });
});

describe('EmailOutboxService.dispatchOrphans', () => {
  it('queues emails logged while the queue was down, once', async () => {
    log.findOrphans.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    log.assignJob.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await service.dispatchOrphans();
    expect(queue.send).toHaveBeenCalledExactlyOnceWith(
      [{ messageId: 'm1', jobId: expect.any(String) }],
      tx,
    );
  });

  it('waits while the queue is down', async () => {
    queue.ready = false;
    await service.dispatchOrphans();
    expect(log.findOrphans).not.toHaveBeenCalled();
  });
});

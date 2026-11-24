import { ConfigService } from '@nestjs/config';
import { AppRole } from '../../../shared/enums/app-role.enum.js';
import {
  EMAIL_DEAD_LETTER_OPTIONS,
  EMAIL_DEAD_LETTER_QUEUE,
  EMAIL_QUEUE,
} from '../constants/email-queue.constants.js';
import { EmailQueueService } from './email-queue.service.js';

const boss = {
  createQueue: vi.fn(),
  updateQueue: vi.fn(),
  work: vi.fn(),
  offWork: vi.fn(),
  insert: vi.fn(),
};
const jobQueue = {
  ready: true,
  boss,
  onReady: vi.fn(async (listener: (b: typeof boss) => Promise<void>) =>
    listener(boss),
  ),
};
const delivery = { process: vi.fn(), abandon: vi.fn() };
const roleConfig = (role: AppRole) => new ConfigService({ app: { role } });

beforeEach(() => vi.clearAllMocks());

describe('EmailQueueService', () => {
  const service = new EmailQueueService(
    jobQueue as never,
    delivery as never,
    roleConfig(AppRole.WORKER),
  );

  it('keeps dead-lettered jobs only briefly and routes failures there', async () => {
    await service.onApplicationBootstrap();
    expect(boss.updateQueue).toHaveBeenCalledWith(
      EMAIL_DEAD_LETTER_QUEUE,
      EMAIL_DEAD_LETTER_OPTIONS,
    );
    expect(boss.updateQueue).toHaveBeenCalledWith(
      EMAIL_QUEUE,
      expect.objectContaining({
        deadLetter: EMAIL_DEAD_LETTER_QUEUE,
        retryLimit: 5,
      }),
    );
  });

  it('tells the worker which attempt it runs and whether it is the last', async () => {
    await service.onApplicationBootstrap();
    const handler = boss.work.mock.calls.find(
      ([name]) => name === EMAIL_QUEUE,
    )![2];
    await handler([
      { id: 'job-1', data: { messageId: 'm1' }, retryCount: 5, retryLimit: 5 },
    ]);
    expect(delivery.process).toHaveBeenCalledWith('m1', {
      jobId: 'job-1',
      attempt: 6,
      lastAttempt: true,
    });
  });

  it('marks dead-lettered jobs as abandoned by their source job', async () => {
    await service.onApplicationBootstrap();
    const handler = boss.work.mock.calls.find(
      ([name]) => name === EMAIL_DEAD_LETTER_QUEUE,
    )![2];
    await handler([{ data: { messageId: 'm1' }, sourceId: 'job-1' }]);
    expect(delivery.abandon).toHaveBeenCalledWith('m1', 'job-1');
  });

  it('inserts jobs through the caller transaction', async () => {
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    await service.send([{ messageId: 'm1', jobId: 'job-1' }], tx as never);
    const [name, jobs, options] = boss.insert.mock.calls[0];
    expect(name).toBe(EMAIL_QUEUE);
    expect(jobs).toEqual([{ id: 'job-1', data: { messageId: 'm1' } }]);
    await options.db.executeSql('SELECT 1', [1]);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1', 1);
  });

  it('waits for emails being sent before the database goes away', async () => {
    await service.onApplicationBootstrap();
    await service.onModuleDestroy();
    expect(boss.offWork).toHaveBeenCalledWith(EMAIL_QUEUE, { wait: true });
  });

  it('only sets up the queues in api processes, leaving the work to the worker', async () => {
    const api = new EmailQueueService(
      jobQueue as never,
      delivery as never,
      roleConfig(AppRole.API),
    );
    await api.onApplicationBootstrap();
    expect(boss.createQueue).toHaveBeenCalledWith(
      EMAIL_QUEUE,
      expect.anything(),
    );
    expect(boss.work).not.toHaveBeenCalled();
    await api.onModuleDestroy();
    expect(boss.offWork).not.toHaveBeenCalled();
  });
});

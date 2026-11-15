import { Logger } from '@nestjs/common';
import { SubscriptionNoticeKind } from '@prisma/client';
import { SubscriptionNoticesCron } from './subscription-notices.cron.js';

describe('SubscriptionNoticesCron', () => {
  const DAY_MS = 86_400_000;
  // 01.12.2026 00:00 in Minsk.
  const accessEndsAt = new Date('2026-11-30T21:00:00Z');
  // 28.11.2026 11:00 in Minsk: three days before, after 10:00 local.
  const now = new Date('2026-11-28T08:00:00Z');

  const billingSettings = {
    graceDays: 3,
    pendingRequestGraceDays: 3,
    reminderDaysBefore: [7, 3, 1],
    enforcementEnabled: true,
  };
  const subscription = (
    id: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    id,
    brandId: `brand-${id}`,
    timezone: 'Europe/Minsk',
    trialEndsAt: accessEndsAt,
    paidUntil: null,
    accessEndsAt,
    graceExtendedUntil: null,
    suspendedAt: null,
    plan: null,
    ...overrides,
  });

  const settings = { get: vi.fn() };
  const notices = {
    findCandidates: vi.fn(),
    record: vi.fn(),
  };
  const mail = { send: vi.fn() };
  const cron = new SubscriptionNoticesCron(
    settings as never,
    notices as never,
    mail as never,
  );

  /** Notice keys already in the "database". */
  let recorded: Set<string>;

  beforeEach(() => {
    vi.clearAllMocks();
    recorded = new Set();
    settings.get.mockResolvedValue(billingSettings);
    notices.findCandidates.mockResolvedValue([subscription('s1')]);
    notices.record.mockImplementation(
      async (id: string, due: { kind: string; anchorAt: Date }) => {
        const key = `${id}:${due.kind}:${due.anchorAt.toISOString()}`;
        if (recorded.has(key)) return false;
        recorded.add(key);
        return true;
      },
    );
    mail.send.mockResolvedValue(undefined);
  });

  it('looks for candidates in the grace and reminder window', async () => {
    await cron.sendNotices(now);
    expect(notices.findCandidates).toHaveBeenCalledWith(
      new Date(now.getTime() - 7 * DAY_MS),
      new Date(now.getTime() + 8 * DAY_MS),
    );
  });

  it('records the nearest due notice before sending the email', async () => {
    const order: string[] = [];
    notices.record.mockImplementation(async () => {
      order.push('record');
      return true;
    });
    mail.send.mockImplementation(async () => {
      order.push('mail');
    });

    await expect(cron.sendNotices(now)).resolves.toBe(1);

    const due = {
      kind: SubscriptionNoticeKind.TRIAL_ENDING,
      anchorAt: accessEndsAt,
      daysBefore: 3,
    };
    expect(notices.record).toHaveBeenCalledWith('s1', due);
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
      due,
      now,
    );
    expect(order).toEqual(['record', 'mail']);
  });

  it('a repeated run does not send the same notice again', async () => {
    await expect(cron.sendNotices(now)).resolves.toBe(1);
    await expect(
      cron.sendNotices(new Date(now.getTime() + 15 * 60_000)),
    ).resolves.toBe(0);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('skips subscriptions with nothing due', async () => {
    notices.findCandidates.mockResolvedValue([
      // Seven days before is still ahead.
      subscription('far', { accessEndsAt: new Date('2026-12-30T21:00:00Z') }),
      subscription('suspended', {
        suspendedAt: new Date('2026-11-20T00:00:00Z'),
      }),
    ]);

    await expect(cron.sendNotices(now)).resolves.toBe(0);
    expect(notices.record).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('a failed email does not stop the others and is not counted', async () => {
    notices.findCandidates.mockResolvedValue([
      subscription('s1'),
      subscription('s2'),
    ]);
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    mail.send.mockRejectedValueOnce(new Error('smtp down'));

    await expect(cron.sendNotices(now)).resolves.toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it('sends nothing to brands the candidate query leaves out', async () => {
    // Deleted brands are filtered by findNoticeCandidates (brand: ACTIVE_BRAND_WHERE).
    notices.findCandidates.mockResolvedValue([]);
    await expect(cron.sendNotices(now)).resolves.toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });
});

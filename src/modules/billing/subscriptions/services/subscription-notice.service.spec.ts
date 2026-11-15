import { SubscriptionNoticeKind } from '@prisma/client';
import { ACTIVE_BRAND_WHERE } from '../../../../shared/database/active-business.where.js';
import {
  minsk,
  subscriptionClient,
  SubscriptionClientMock,
} from '../../testing/subscription.fixtures.js';
import { SubscriptionNoticeService } from './subscription-notice.service.js';

describe('SubscriptionNoticeService', () => {
  let db: SubscriptionClientMock;
  let service: SubscriptionNoticeService;

  beforeEach(() => {
    db = subscriptionClient();
    service = new SubscriptionNoticeService(db as never);
  });

  it('candidates exclude deleted and suspended brands', async () => {
    db.subscription.findMany.mockResolvedValue([]);
    const from = minsk('2026-11-01');
    const to = minsk('2026-12-01');
    await service.findCandidates(from, to);
    expect(db.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          suspendedAt: null,
          accessEndsAt: { gte: from, lte: to },
          brand: ACTIVE_BRAND_WHERE,
        },
      }),
    );
  });

  it('record is true only for the first insert', async () => {
    const due = {
      kind: SubscriptionNoticeKind.TRIAL_ENDING,
      anchorAt: minsk('2026-12-01'),
      daysBefore: 3,
    };
    db.subscriptionNotice.createMany.mockResolvedValueOnce({ count: 1 });
    db.subscriptionNotice.createMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.record('sub-1', due)).resolves.toBe(true);
    await expect(service.record('sub-1', due)).resolves.toBe(false);
    expect(db.subscriptionNotice.createMany).toHaveBeenCalledWith({
      data: [{ subscriptionId: 'sub-1', ...due }],
      skipDuplicates: true,
    });
  });
});

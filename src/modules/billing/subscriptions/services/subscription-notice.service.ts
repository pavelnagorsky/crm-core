import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service.js';
import { ACTIVE_BRAND_WHERE } from '../../../../shared/database/active-business.where.js';
import { SUBSCRIPTION_WITH_PLAN_INCLUDE } from '../../constants/billing-plan-select.js';
import { SubscriptionNoticeDue } from '../../interfaces/subscription-notice-due.interface.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';

/** Owns SubscriptionNotice: which reminders were already sent (plan section 9.2). */
@Injectable()
export class SubscriptionNoticeService {
  constructor(private readonly db: DatabaseService) {}

  /** Subscriptions of active brands whose access ends inside the notice window. */
  findCandidates(from: Date, to: Date): Promise<SubscriptionWithPlan[]> {
    return this.db.subscription.findMany({
      where: {
        suspendedAt: null,
        accessEndsAt: { gte: from, lte: to },
        brand: ACTIVE_BRAND_WHERE,
      },
      include: SUBSCRIPTION_WITH_PLAN_INCLUDE,
    });
  }

  /** At-most-once key: true when this notice was not sent before. */
  async record(
    subscriptionId: string,
    due: SubscriptionNoticeDue,
  ): Promise<boolean> {
    const { count } = await this.db.subscriptionNotice.createMany({
      data: [
        {
          subscriptionId,
          kind: due.kind,
          anchorAt: due.anchorAt,
          daysBefore: due.daysBefore,
        },
      ],
      skipDuplicates: true,
    });
    return count > 0;
  }
}

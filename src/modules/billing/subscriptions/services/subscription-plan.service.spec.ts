import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingActors } from '../../constants/billing-actors.js';
import {
  BILLING_SETTINGS,
  minsk,
  NO_PRICES,
  PRO,
  START,
  subscription,
  SubscriptionClientMock,
  subscriptionClients,
  withoutPrices,
} from '../../testing/subscription.fixtures.js';
import { SubscriptionEventService } from './subscription-event.service.js';
import { SubscriptionPlanService } from './subscription-plan.service.js';

describe('SubscriptionPlanService', () => {
  const settings = { read: vi.fn() };
  const plans = { findAllCached: vi.fn() };
  let tx: SubscriptionClientMock;
  let service: SubscriptionPlanService;

  beforeEach(() => {
    vi.clearAllMocks();
    const clients = subscriptionClients();
    tx = clients.tx;
    settings.read.mockResolvedValue({ ...BILLING_SETTINGS });
    plans.findAllCached.mockResolvedValue([START, PRO, NO_PRICES]);
    service = new SubscriptionPlanService(
      new SubscriptionEventService(clients.db as never),
      settings as never,
      plans as never,
    );
  });

  describe('changePlan', () => {
    it('changePlan without a paid remainder is SUBSCRIPTION_NO_PAID_PERIOD', async () => {
      await expect(
        service.changePlan(
          subscription({ planId: START.id, plan: withoutPrices(START) }),
          withoutPrices(PRO),
          BillingActors.owner('owner-1'),
          tx as never,
          minsk('2026-11-20'),
        ),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.SUBSCRIPTION_NO_PAID_PERIOD.code,
      });
    });
  });
});

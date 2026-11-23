import { Injectable, Logger } from '@nestjs/common';
import { ExclusiveCron } from '../../../../shared/cron/decorators/exclusive-cron.decorator.js';
import { SubscriptionNoticeCalculator } from '../../compute/subscription-notice.calculator.js';
import { SubscriptionNoticeMailService } from '../../mail/services/subscription-notice-mail.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionNoticeService } from '../../subscriptions/services/subscription-notice.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reminders of plan section 9.2. At most once: the notice row is inserted before
 * the email goes out, so a crash loses an email rather than doubling it.
 */
@Injectable()
export class SubscriptionNoticesCron {
  private readonly logger = new Logger(SubscriptionNoticesCron.name);

  constructor(
    private readonly settings: BillingSettingsService,
    private readonly notices: SubscriptionNoticeService,
    private readonly mail: SubscriptionNoticeMailService,
  ) {}

  @ExclusiveCron('0 */15 * * * *')
  async sendNotices(now = new Date()): Promise<number> {
    const settings = await this.settings.get();
    const maxBefore = Math.max(0, ...settings.reminderDaysBefore);
    const candidates = await this.notices.findCandidates(
      // A request extends grace (plan section 4.2), so ACCESS_LIMITED may come later.
      new Date(
        now.getTime() -
          (settings.graceDays + settings.pendingRequestGraceDays + 1) * DAY_MS,
      ),
      new Date(now.getTime() + (maxBefore + 1) * DAY_MS),
    );
    let sent = 0;
    for (const subscription of candidates) {
      const due = SubscriptionNoticeCalculator.due(subscription, settings, now);
      if (!due) continue;
      try {
        if (!(await this.notices.record(subscription.id, due))) continue;
        await this.mail.send(subscription, due, now);
        sent++;
      } catch (e: any) {
        this.logger.error(
          `Notice ${due.kind} for brand ${subscription.brandId} failed: ${e.message}`,
          e.stack,
        );
      }
    }
    if (sent) this.logger.log(`Subscription notices sent: ${sent}`);
    return sent;
  }
}

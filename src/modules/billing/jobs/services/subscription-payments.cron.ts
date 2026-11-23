import { Injectable, Logger } from '@nestjs/common';
import { ExclusiveCron } from '../../../../shared/cron/decorators/exclusive-cron.decorator.js';
import { PaymentRequestService } from '../../payments/services/payment-request.service.js';

/** PENDING requests past `expiresAt` become EXPIRED (plan section 4.2). */
@Injectable()
export class SubscriptionPaymentsCron {
  private readonly logger = new Logger(SubscriptionPaymentsCron.name);

  constructor(private readonly requests: PaymentRequestService) {}

  @ExclusiveCron('0 5 * * * *')
  async expireDue(now = new Date()): Promise<number> {
    const expired = await this.requests.expireDue(now);
    if (expired.length)
      this.logger.log(`${expired.length} payment requests expired`);
    return expired.length;
  }
}

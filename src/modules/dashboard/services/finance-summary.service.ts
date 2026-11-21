import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { LocationService } from '../../location/services/location.service.js';
import { FinanceRange } from '../../orders/aggregates/interfaces/finance-range.interface.js';
import { NotSpecifiedResult } from '../../orders/aggregates/interfaces/not-specified-result.interface.js';
import { OrdersAggregatesService } from '../../orders/aggregates/services/orders-aggregates.service.js';
import { PaymentsAggregatesService } from '../../payments/aggregates/services/payments-aggregates.service.js';
import { FinanceSummaryRequestDto } from '../dto/finance-summary-request.dto.js';
import { FinanceSummary } from '../interfaces/finance-summary.interface.js';
import { assertFinanceSummaryPeriod } from '../rules/finance-summary-period.js';
import { trackedRange } from '../rules/finance-tracked-range.js';

const NOT_SPECIFIED_LIMIT = 20;

/**
 * Money of a period for the till and the terminal, and visits and sales whose payment is not
 * specified. Money counts by the day it changed hands over the whole period, the list by the
 * day of the visit or sale and only from the start of payment tracking. The whole location:
 * the till and the terminal are shared.
 */
@Injectable()
export class FinanceSummaryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly paymentsAggregates: PaymentsAggregatesService,
    private readonly ordersAggregates: OrdersAggregatesService,
  ) {}

  async summary(
    locationId: string,
    dto: FinanceSummaryRequestDto,
  ): Promise<FinanceSummary> {
    assertFinanceSummaryPeriod(dto.from, dto.to);
    const [{ timezone, currency }, tracking] = await Promise.all([
      this.locations.getLocale(locationId),
      this.locations.getPaymentTracking(locationId),
    ]);
    const bounds = TimeUtils.zonedDaysRange(dto.from, dto.to, timezone);
    const range = { locationId, from: bounds.gte!, to: bounds.lt! };
    const { money, notSpecified } = await this.read(
      range,
      trackedRange(range, tracking),
    );
    return {
      from: dto.from,
      to: dto.to,
      currency,
      timezone,
      money,
      notSpecified,
    };
  }

  /** One snapshot: money and the "not specified" list agree with each other. */
  private read(
    range: FinanceRange,
    tracked: FinanceRange | null,
  ): Promise<Pick<FinanceSummary, 'money' | 'notSpecified'>> {
    return this.db.$transaction(
      async (tx) => ({
        money: await this.paymentsAggregates.moneyTotals(range, tx),
        notSpecified: tracked
          ? await this.ordersAggregates.notSpecified(
              tracked,
              NOT_SPECIFIED_LIMIT,
              tx,
            )
          : this.nothingNotSpecified(),
      }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
  }

  private nothingNotSpecified(): NotSpecifiedResult {
    return { items: [], count: 0, amount: MoneyUtils.decimal(0) };
  }
}

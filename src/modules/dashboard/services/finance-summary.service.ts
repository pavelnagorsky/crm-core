import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { OrdersAggregatesService } from '../../orders/aggregates/services/orders-aggregates.service.js';
import { PaymentsAggregatesService } from '../../payments/aggregates/services/payments-aggregates.service.js';
import { FinanceSummaryRequestDto } from '../dto/finance-summary-request.dto.js';
import { FinanceSummary } from '../interfaces/finance-summary.interface.js';

const MAX_DAYS = 62;
const NOT_SPECIFIED_LIMIT = 20;
const DAY_MS = 86_400_000;

/**
 * Money of a period for the till and the terminal, and visits and sales whose payment is not
 * specified. Money counts by the day it changed hands, the list by the day of the visit or
 * sale. The whole location: the till and the terminal are shared.
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
    const days =
      (TimeUtils.dateOnly(dto.to).getTime() -
        TimeUtils.dateOnly(dto.from).getTime()) /
        DAY_MS +
      1;
    if (days < 1)
      throw new AppException(
        ErrorCode.DASHBOARD_CUSTOM_RANGE_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    if (days > MAX_DAYS)
      throw new AppException(
        ErrorCode.FINANCE_SUMMARY_RANGE_TOO_LONG,
        HttpStatus.BAD_REQUEST,
      );
    const { timezone, currency } = await this.locations.getLocale(locationId);
    const bounds = TimeUtils.zonedDaysRange(dto.from, dto.to, timezone);
    const range = { locationId, from: bounds.gte!, to: bounds.lt! };
    // One snapshot: money and the "not specified" list agree with each other.
    const [money, notSpecified] = await this.db.$transaction(
      async (tx) =>
        [
          await this.paymentsAggregates.moneyTotals(range, tx),
          await this.ordersAggregates.notSpecified(
            range,
            NOT_SPECIFIED_LIMIT,
            tx,
          ),
        ] as const,
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5_000,
        timeout: 30_000,
      },
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
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { activeLocationSql } from '../../../../shared/database/active-business.sql.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { PaymentMethod } from '../../enums/payment-method.enum.js';
import { PaymentType } from '../../enums/payment-type.enum.js';
import { PaymentMoneyRange } from '../../interfaces/payment-money-range.interface.js';
import { PaymentMoneyTotals } from '../../interfaces/payment-money-totals.interface.js';

@Injectable()
export class PaymentsAggregatesService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Money of active records whose `occurredAt` is in the range: net by method, plus the
   * refunds already subtracted from it. Uses the `Payment(locationId, occurredAt)` index.
   */
  async moneyTotals(
    range: PaymentMoneyRange,
    client: Prisma.TransactionClient = this.db,
  ): Promise<PaymentMoneyTotals> {
    // occurredAt is a naive UTC timestamp: compare it with the bounds as timestamps.
    const rows = await client.$queryRaw<
      Array<{ type: PaymentType; method: PaymentMethod; amount: string }>
    >(Prisma.sql`
      SELECT p."type" AS type,
             p."method" AS method,
             COALESCE(SUM(p."amount"), 0)::text AS amount
      FROM "Payment" p
      WHERE p."locationId" = ${range.locationId}
        AND ${activeLocationSql(Prisma.sql`p."locationId"`)}
        AND p."voidedAt" IS NULL
        AND p."occurredAt" >= ${range.from}::timestamptz AT TIME ZONE 'UTC'
        AND p."occurredAt" < ${range.to}::timestamptz AT TIME ZONE 'UTC'
      GROUP BY p."type", p."method"
    `);
    const sum = (type: PaymentType, method: PaymentMethod) =>
      MoneyUtils.decimal(
        rows.find((row) => row.type === type && row.method === method)?.amount,
      );
    const refundCash = sum(PaymentType.REFUND, PaymentMethod.CASH);
    const refundCard = sum(PaymentType.REFUND, PaymentMethod.CARD);
    const cash = sum(PaymentType.PAYMENT, PaymentMethod.CASH).minus(refundCash);
    const card = sum(PaymentType.PAYMENT, PaymentMethod.CARD).minus(refundCard);
    return { cash, card, total: cash.plus(card), refundCash, refundCard };
  }

  /** True when the order has no active journal record. Embedded in order scans. */
  noActiveRecordsSql(orderId: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "Payment" active_payment
      WHERE active_payment."orderId" = ${orderId}
        AND active_payment."voidedAt" IS NULL
    )`;
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { OrderPaymentTotals } from '../interfaces/order-payment-totals.interface.js';
import { PaymentOperationWithPayments } from '../interfaces/payment-operation-with-payments.interface.js';
import { paymentTotals } from '../rules/payment-state.rules.js';

@Injectable()
export class PaymentReadService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Active journal of each order, keyed by order id. Orders without active records are
   * absent. Voided records and fully voided operations are left out.
   */
  async totalsByOrders(
    orderIds: readonly string[],
    client: Prisma.TransactionClient = this.db,
  ): Promise<Map<string, OrderPaymentTotals>> {
    const ids = [...new Set(orderIds)];
    if (ids.length === 0) return new Map();
    const operations = await client.paymentOperation.findMany({
      where: {
        orderId: { in: ids },
        payments: { some: { voidedAt: null } },
      },
      include: {
        payments: {
          where: { voidedAt: null },
          orderBy: [{ method: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byOrder = new Map<string, PaymentOperationWithPayments[]>();
    for (const operation of operations) {
      const list = byOrder.get(operation.orderId);
      if (list) list.push(operation);
      else byOrder.set(operation.orderId, [operation]);
    }
    const result = new Map<string, OrderPaymentTotals>();
    for (const [orderId, list] of byOrder) {
      result.set(orderId, {
        orderId,
        ...paymentTotals(list.flatMap((operation) => operation.payments)),
        payment:
          list.find((operation) => operation.type === PaymentType.PAYMENT) ??
          null,
        refunds: list.filter(
          (operation) => operation.type === PaymentType.REFUND,
        ),
      });
    }
    return result;
  }
}

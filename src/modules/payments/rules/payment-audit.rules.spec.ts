import { PaymentMethod, PaymentType, Prisma } from '@prisma/client';
import { PaymentChangeKind } from '../enums/payment-change-kind.enum.js';
import { PaymentChange } from '../interfaces/payment-change.interface.js';
import { PaymentOperationWithPayments } from '../interfaces/payment-operation-with-payments.interface.js';
import { paymentAuditPayload } from './payment-audit.rules.js';

const occurredAt = new Date('2026-11-21T10:00:00.000Z');

function operation(
  id: string,
  parts: Array<[PaymentMethod, string]>,
): PaymentOperationWithPayments {
  return {
    id,
    type: PaymentType.PAYMENT,
    orderReturnId: null,
    payments: parts.map(([method, amount]) => ({
      method,
      amount: new Prisma.Decimal(amount),
      occurredAt,
    })),
  } as unknown as PaymentOperationWithPayments;
}

const change: PaymentChange = {
  kind: PaymentChangeKind.REPLACED,
  locationId: 'location-1',
  orderId: 'order-1',
  currency: 'BYN',
  operation: operation('op-new', [
    [PaymentMethod.CASH, '500'],
    [PaymentMethod.CARD, '1000'],
  ]),
  previous: operation('op-old', [[PaymentMethod.CARD, '1500']]),
  amountDue: new Prisma.Decimal('1500'),
  reason: null,
};

describe('paymentAuditPayload', () => {
  it('formats the parts, the date and the replaced payment', () => {
    expect(paymentAuditPayload(change, 'booking-1')).toEqual({
      operationId: 'op-new',
      operationType: PaymentType.PAYMENT,
      bookingId: 'booking-1',
      parts: [
        { method: PaymentMethod.CASH, amount: '500.00' },
        { method: PaymentMethod.CARD, amount: '1000.00' },
      ],
      occurredAt: occurredAt.toISOString(),
      amountDue: '1500.00',
      currency: 'BYN',
      reason: null,
      orderReturnId: null,
      previousOperationId: 'op-old',
      previousParts: [{ method: PaymentMethod.CARD, amount: '1500.00' }],
    });
  });

  it('leaves out what a void does not have', () => {
    const payload = paymentAuditPayload(
      {
        ...change,
        kind: PaymentChangeKind.VOIDED,
        operation: operation('op-new', []),
        previous: null,
        amountDue: null,
        reason: 'Ошибка',
      },
      null,
    );
    expect(payload).toMatchObject({
      parts: [],
      occurredAt: null,
      amountDue: null,
      reason: 'Ошибка',
      previousOperationId: null,
      previousParts: null,
    });
  });
});

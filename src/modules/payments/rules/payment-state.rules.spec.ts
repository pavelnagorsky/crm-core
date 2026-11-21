import { PaymentMethod, PaymentType, Prisma } from '@prisma/client';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import {
  paymentStatus,
  paymentStatusOf,
  paymentTotals,
  refundLimit,
} from './payment-state.rules.js';

const d = (value: string | number) => new Prisma.Decimal(value);

function record(
  type: PaymentType,
  method: PaymentMethod,
  amount: string,
  voidedAt: Date | null = null,
) {
  return { type, method, amount: d(amount), voidedAt };
}

describe('paymentTotals', () => {
  it('sums active payments minus refunds, overall and by method', () => {
    const totals = paymentTotals([
      record(PaymentType.PAYMENT, PaymentMethod.CASH, '1000.00'),
      record(PaymentType.PAYMENT, PaymentMethod.CARD, '2000.00'),
      record(PaymentType.REFUND, PaymentMethod.CARD, '500.00'),
    ]);
    expect(totals.cashAmount.toFixed(2)).toBe('1000.00');
    expect(totals.cardAmount.toFixed(2)).toBe('1500.00');
    expect(totals.paidAmount.toFixed(2)).toBe('2500.00');
    expect(totals.refundedAmount.toFixed(2)).toBe('500.00');
    expect(totals.hasRecords).toBe(true);
  });

  it('skips voided records', () => {
    const totals = paymentTotals([
      record(PaymentType.PAYMENT, PaymentMethod.CASH, '1000.00', new Date()),
      record(PaymentType.PAYMENT, PaymentMethod.CARD, '1000.00'),
    ]);
    expect(totals.paidAmount.toFixed(2)).toBe('1000.00');
    expect(totals.cashAmount.toFixed(2)).toBe('0.00');
  });

  it('has no records when everything is voided', () => {
    const totals = paymentTotals([
      record(PaymentType.PAYMENT, PaymentMethod.CASH, '10.00', new Date()),
    ]);
    expect(totals.hasRecords).toBe(false);
    expect(totals.paidAmount.toFixed(2)).toBe('0.00');
  });

  it('lets a refund by another method drive one method negative', () => {
    const totals = paymentTotals([
      record(PaymentType.PAYMENT, PaymentMethod.CASH, '100.00'),
      record(PaymentType.REFUND, PaymentMethod.CARD, '40.00'),
    ]);
    expect(totals.cardAmount.toFixed(2)).toBe('-40.00');
    expect(totals.paidAmount.toFixed(2)).toBe('60.00');
  });
});

describe('paymentStatus', () => {
  const none = { paidAmount: d(0), hasRecords: false };

  it.each([true, false])(
    'is NOT_REQUIRED without records and nothing due (tracked: %s)',
    (tracked) => {
      expect(paymentStatus(d(0), none, tracked)).toBe(
        PaymentStatus.NOT_REQUIRED,
      );
    },
  );

  it('is NOT_SPECIFIED without records, something due and tracked', () => {
    expect(paymentStatus(d('0.01'), none, true)).toBe(
      PaymentStatus.NOT_SPECIFIED,
    );
  });

  it('is NOT_TRACKED without records, something due and not tracked', () => {
    expect(paymentStatus(d('0.01'), none, false)).toBe(
      PaymentStatus.NOT_TRACKED,
    );
  });

  it.each([true, false])(
    'is PAID when the paid amount equals the amount due (tracked: %s)',
    (tracked) => {
      expect(
        paymentStatus(
          d('3000'),
          { paidAmount: d('3000.00'), hasRecords: true },
          tracked,
        ),
      ).toBe(PaymentStatus.PAID);
    },
  );

  it('is PAID for a settled visit: paid and fully refunded, nothing due', () => {
    expect(
      paymentStatus(d(0), { paidAmount: d(0), hasRecords: true }, true),
    ).toBe(PaymentStatus.PAID);
  });

  it.each([true, false])(
    'is UNDERPAID when less is paid (tracked: %s)',
    (tracked) => {
      expect(
        paymentStatus(
          d('3000'),
          { paidAmount: d('2999.99'), hasRecords: true },
          tracked,
        ),
      ).toBe(PaymentStatus.UNDERPAID);
    },
  );

  it.each([true, false])(
    'is OVERPAID when more is paid, for example a cancelled paid visit (tracked: %s)',
    (tracked) => {
      expect(
        paymentStatus(d(0), { paidAmount: d('3000'), hasRecords: true }, tracked),
      ).toBe(PaymentStatus.OVERPAID);
    },
  );
});

describe('paymentStatusOf', () => {
  it('treats missing totals as nothing recorded', () => {
    expect(paymentStatusOf(d('1500'), null, true)).toBe(
      PaymentStatus.NOT_SPECIFIED,
    );
    expect(paymentStatusOf(d('1500'), undefined, false)).toBe(
      PaymentStatus.NOT_TRACKED,
    );
  });

  it('shows records whether tracked or not', () => {
    const totals = { paidAmount: d('1500'), hasRecords: true };
    expect(paymentStatusOf(d('1500'), totals, false)).toBe(PaymentStatus.PAID);
  });
});

describe('refundLimit', () => {
  it('limits a refund to what its method brought in', () => {
    const totals = paymentTotals([
      record(PaymentType.PAYMENT, PaymentMethod.CARD, '1000.00'),
    ]);
    expect(refundLimit(totals, PaymentMethod.CASH).toFixed(2)).toBe('0.00');
    expect(refundLimit(totals, PaymentMethod.CARD).toFixed(2)).toBe('1000.00');
  });

  it('subtracts earlier refunds of the method', () => {
    const totals = paymentTotals([
      record(PaymentType.PAYMENT, PaymentMethod.CASH, '400.00'),
      record(PaymentType.PAYMENT, PaymentMethod.CARD, '600.00'),
      record(PaymentType.REFUND, PaymentMethod.CASH, '150.00'),
    ]);
    expect(refundLimit(totals, PaymentMethod.CASH).toFixed(2)).toBe('250.00');
    expect(refundLimit(totals, PaymentMethod.CARD).toFixed(2)).toBe('600.00');
  });

  it('never exceeds the paid amount and never goes below 0', () => {
    // Legacy data: a card refund over a cash payment left card negative.
    const totals = paymentTotals([
      record(PaymentType.PAYMENT, PaymentMethod.CASH, '100.00'),
      record(PaymentType.REFUND, PaymentMethod.CARD, '40.00'),
    ]);
    expect(refundLimit(totals, PaymentMethod.CASH).toFixed(2)).toBe('60.00');
    expect(refundLimit(totals, PaymentMethod.CARD).toFixed(2)).toBe('0.00');
  });
});

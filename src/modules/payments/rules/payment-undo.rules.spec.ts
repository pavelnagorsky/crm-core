import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { thrownAppException } from '../testing/thrown-app-exception.js';
import {
  assertPaymentUndoable,
  isOperationVoided,
} from './payment-undo.rules.js';

const createdAt = new Date('2026-11-21T10:00:00.000Z');
const operation = {
  type: PaymentType.PAYMENT,
  replacesOperationId: null,
  createdById: 'user-1',
  createdAt,
};
const after = (ms: number) => new Date(createdAt.getTime() + ms);
const context = {
  actorId: 'user-1',
  hasActiveRefunds: false,
  now: after(60_000),
};

describe('assertPaymentUndoable', () => {
  it('lets the author undo a fresh first payment', () => {
    expect(() => assertPaymentUndoable(operation, context)).not.toThrow();
  });

  it('allows 9:59 minutes and exactly 10 minutes', () => {
    expect(() =>
      assertPaymentUndoable(operation, { ...context, now: after(599_000) }),
    ).not.toThrow();
    expect(() =>
      assertPaymentUndoable(operation, { ...context, now: after(600_000) }),
    ).not.toThrow();
  });

  it('refuses after 10:01 minutes: 409 PAYMENT_UNDO_EXPIRED', () => {
    const error = thrownAppException(() =>
      assertPaymentUndoable(operation, { ...context, now: after(601_000) }),
    );
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_UNDO_EXPIRED.code);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it.each([
    ['another author', operation, { ...context, actorId: 'user-2' }],
    ['an actor without a user', operation, { ...context, actorId: undefined }],
    [
      'an operation without an author',
      { ...operation, createdById: null },
      { ...context, actorId: undefined },
    ],
    ['a refund', { ...operation, type: PaymentType.REFUND }, context],
    [
      'a replacement',
      { ...operation, replacesOperationId: 'op-0' },
      context,
    ],
    ['an order with refunds', operation, { ...context, hasActiveRefunds: true }],
  ])('refuses %s: 409 PAYMENT_UNDO_NOT_ALLOWED', (_, target, ctx) => {
    const error = thrownAppException(() => assertPaymentUndoable(target, ctx));
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_UNDO_NOT_ALLOWED.code);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('checks the right to undo before the time', () => {
    const error = thrownAppException(() =>
      assertPaymentUndoable(operation, {
        ...context,
        actorId: 'user-2',
        now: after(3_600_000),
      }),
    );
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_UNDO_NOT_ALLOWED.code);
  });
});

describe('isOperationVoided', () => {
  it('is true when every record is voided', () => {
    expect(
      isOperationVoided({ payments: [{ voidedAt: createdAt }] }),
    ).toBe(true);
  });

  it('is false while a record is active', () => {
    expect(
      isOperationVoided({
        payments: [{ voidedAt: createdAt }, { voidedAt: null }],
      }),
    ).toBe(false);
  });
});

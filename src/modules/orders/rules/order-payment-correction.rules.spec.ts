import { ForbiddenException } from '@nestjs/common';
import { PaymentType } from '../../payments/enums/payment-type.enum.js';
import {
  assertVisitParticipant,
  assertVoidAllowedForVisit,
} from './order-payment-correction.rules.js';

const active = { payments: [{ voidedAt: null }] };
const voided = { payments: [{ voidedAt: new Date() }] };

describe('assertVoidAllowedForVisit', () => {
  it('refuses an active refund of a deleted visit: 409 BOOKING_PAYMENT_NOT_ALLOWED', () => {
    expect(() =>
      assertVoidAllowedForVisit(
        { deleted: true },
        { type: PaymentType.REFUND, ...active },
      ),
    ).toThrow(
      expect.objectContaining({
        errorCode: 'BOOKING_PAYMENT_NOT_ALLOWED',
        status: 409,
      }),
    );
  });

  it.each([
    ['a payment of a deleted visit', { deleted: true }, PaymentType.PAYMENT, active],
    ['a voided refund of a deleted visit', { deleted: true }, PaymentType.REFUND, voided],
    ['a refund of a live visit', { deleted: false }, PaymentType.REFUND, active],
    ['a refund of a sale', null, PaymentType.REFUND, active],
  ])('allows %s', (_, visit, type, records) => {
    expect(() =>
      assertVoidAllowedForVisit(visit, { type, ...records }),
    ).not.toThrow();
  });

  it('allows an unknown operation: the journal answers 404', () => {
    expect(() => assertVoidAllowedForVisit({ deleted: true }, null)).not.toThrow();
  });
});

describe('assertVisitParticipant', () => {
  const visit = { staffIds: ['staff-1', 'staff-2'] };

  it('lets anyone through without a participant limit', () => {
    expect(() => assertVisitParticipant(visit, undefined)).not.toThrow();
  });

  it('lets a master of the visit through', () => {
    expect(() => assertVisitParticipant(visit, 'staff-2')).not.toThrow();
  });

  it('refuses a master who no longer takes part: 403', () => {
    expect(() => assertVisitParticipant(visit, 'staff-3')).toThrow(
      ForbiddenException,
    );
  });
});

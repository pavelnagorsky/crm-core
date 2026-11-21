import { orderPaymentMoment } from './order-payment-tracking.rules.js';

describe('orderPaymentMoment', () => {
  const occurredAt = new Date('2026-11-21T12:00:00.000Z');
  const startAt = new Date('2026-11-20T09:00:00.000Z');

  it('takes the date of a sale', () => {
    expect(orderPaymentMoment({ bookingId: null, occurredAt }, undefined)).toBe(
      occurredAt,
    );
  });

  it('takes the visit start of a visit order', () => {
    expect(orderPaymentMoment({ bookingId: 'b-1', occurredAt }, startAt)).toBe(
      startAt,
    );
  });

  it('falls back to the order date when the visit is gone', () => {
    expect(
      orderPaymentMoment({ bookingId: 'b-1', occurredAt }, undefined),
    ).toBe(occurredAt);
  });
});

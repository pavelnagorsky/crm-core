import {
  assertPaymentDate,
  defaultSalePaymentDate,
  defaultVisitPaymentDate,
  recordedPaymentDate,
  resolvePaymentDate,
} from './payment-occurred-at.rules.js';

const minsk = 'Europe/Minsk'; // UTC+3
const now = new Date('2026-11-20T09:00:00.000Z'); // 12:00 in Minsk

describe('assertPaymentDate', () => {
  it('accepts now, 5 minutes ahead and 366 days back', () => {
    expect(() => assertPaymentDate(now, now)).not.toThrow();
    expect(() =>
      assertPaymentDate(new Date(now.getTime() + 5 * 60_000), now),
    ).not.toThrow();
    expect(() =>
      assertPaymentDate(new Date(now.getTime() - 366 * 86_400_000), now),
    ).not.toThrow();
  });

  it('rejects later than 5 minutes ahead and older than 366 days', () => {
    const invalid = expect.objectContaining({
      errorCode: 'PAYMENT_DATE_INVALID',
      status: 400,
    });
    expect(() =>
      assertPaymentDate(new Date(now.getTime() + 5 * 60_000 + 1), now),
    ).toThrow(invalid);
    expect(() =>
      assertPaymentDate(new Date(now.getTime() - 366 * 86_400_000 - 1), now),
    ).toThrow(invalid);
  });
});

describe('resolvePaymentDate', () => {
  it('reads local wall time of the location', () => {
    expect(resolvePaymentDate('2026-11-19T18:30:00', minsk, now)).toEqual(
      new Date('2026-11-19T15:30:00.000Z'),
    );
  });

  it('is null without an explicit date', () => {
    expect(resolvePaymentDate(undefined, minsk, now)).toBeNull();
    expect(resolvePaymentDate(null, minsk, now)).toBeNull();
  });

  it('checks the limits after conversion', () => {
    expect(() => resolvePaymentDate('2026-11-20T12:06:00', minsk, now)).toThrow(
      expect.objectContaining({ errorCode: 'PAYMENT_DATE_INVALID' }),
    );
  });
});

describe('defaultVisitPaymentDate', () => {
  it('is now for a visit today', () => {
    const startAt = new Date('2026-11-20T06:00:00.000Z');
    expect(defaultVisitPaymentDate(startAt, now, minsk)).toBe(now);
  });

  it('is now for a future visit (prepayment)', () => {
    const startAt = new Date('2026-11-25T06:00:00.000Z');
    expect(defaultVisitPaymentDate(startAt, now, minsk)).toBe(now);
  });

  it('is the visit start for a visit of a past day', () => {
    const startAt = new Date('2026-11-18T06:00:00.000Z');
    expect(defaultVisitPaymentDate(startAt, now, minsk)).toBe(startAt);
  });

  it('uses the location day at its boundaries', () => {
    // 23:30 yesterday in Minsk, 20:30 UTC: a past day although UTC is the same date.
    const lateYesterday = new Date('2026-11-19T20:30:00.000Z');
    const earlyMorning = new Date('2026-11-19T21:30:00.000Z'); // 00:30 today in Minsk
    const morning = new Date('2026-11-19T22:00:00.000Z'); // 01:00 today in Minsk
    expect(defaultVisitPaymentDate(lateYesterday, morning, minsk)).toBe(
      lateYesterday,
    );
    expect(defaultVisitPaymentDate(earlyMorning, morning, minsk)).toBe(morning);
  });
});

describe('defaultSalePaymentDate', () => {
  it('is the sale date for a sale of a past day, otherwise now', () => {
    const yesterday = new Date('2026-11-19T10:00:00.000Z');
    const today = new Date('2026-11-20T05:00:00.000Z');
    expect(defaultSalePaymentDate(yesterday, now, minsk)).toBe(yesterday);
    expect(defaultSalePaymentDate(today, now, minsk)).toBe(now);
  });
});

describe('recordedPaymentDate', () => {
  const explicit = new Date('2026-11-19T10:00:00.000Z');
  const replaced = new Date('2026-11-18T10:00:00.000Z');

  it('takes the explicit date first', () => {
    expect(recordedPaymentDate(explicit, replaced, now)).toBe(explicit);
  });

  it('keeps the date of the replaced payment', () => {
    expect(recordedPaymentDate(null, replaced, now)).toBe(replaced);
  });

  it('falls back to the default date', () => {
    expect(recordedPaymentDate(null, undefined, now)).toBe(now);
  });
});

import { dateOnly, dateOnlyStr, daysInUtcMonth, dec, money } from './money.js';

describe('money utils', () => {
  it('normalizes decimals and formats money to 2dp', () => {
    expect(money(20)).toBe('20.00');
    expect(money('9.5')).toBe('9.50');
    expect(money(null)).toBe('0.00');
    expect(dec('1.10').plus('2.20').toString()).toBe('3.3');
  });

  it('parses and formats UTC date-only values without TZ drift', () => {
    const d = dateOnly('2026-09-15');
    expect(d.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(dateOnlyStr(d)).toBe('2026-09-15');
  });

  it('uses calendar days of the UTC month', () => {
    expect(daysInUtcMonth(dateOnly('2026-02-01'))).toBe(28);
    expect(daysInUtcMonth(dateOnly('2026-09-30'))).toBe(30);
    expect(daysInUtcMonth(dateOnly('2026-01-31'))).toBe(31);
  });
});

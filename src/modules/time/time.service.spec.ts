import { TimeService } from './time.service.js';

describe('TimeService date-only helpers', () => {
  it('parses and formats UTC date-only values without TZ drift', () => {
    const d = TimeService.dateOnly('2026-09-15');
    expect(d.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(TimeService.dateOnlyStr(d)).toBe('2026-09-15');
  });

  it('uses calendar days of the UTC month', () => {
    expect(TimeService.daysInUtcMonth(TimeService.dateOnly('2026-02-01'))).toBe(28);
    expect(TimeService.daysInUtcMonth(TimeService.dateOnly('2026-09-30'))).toBe(30);
    expect(TimeService.daysInUtcMonth(TimeService.dateOnly('2026-01-31'))).toBe(31);
  });
});

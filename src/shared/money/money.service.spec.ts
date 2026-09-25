import { MoneyService } from './money.service.js';

describe('MoneyService', () => {
  it('pads an exact amount and keeps arithmetic exact until quantize', () => {
    expect(MoneyService.format(20)).toBe('20.00');
    expect(MoneyService.format('9.5')).toBe('9.50');
    expect(MoneyService.format(null)).toBe('0.00');
    expect(MoneyService.format('-75.5')).toBe('-75.50');
    expect(MoneyService.decimal('1.10').plus('2.20').toString()).toBe('3.3');
    expect(MoneyService.format(MoneyService.decimal('1.10').plus('2.20'))).toBe('3.30');
  });

  it('accepts at most 2 fractional digits and leaves a longer fraction for validation', () => {
    expect(MoneyService.canonical('49')).toBe('49.00');
    expect(MoneyService.canonical('49.5')).toBe('49.50');
    expect(MoneyService.canonical(49.5)).toBe('49.50');
    expect(MoneyService.canonical('-12.5')).toBe('-12.50');
    expect(MoneyService.canonical('1.005')).toBe('1.005');
    expect(MoneyService.canonical('8.995')).toBe('8.995');
    expect(MoneyService.canonical('abc')).toBe('abc');
  });

  it('quantizes half-up once', () => {
    expect(MoneyService.format(MoneyService.quantize('1.005'))).toBe('1.01');
    expect(MoneyService.format(MoneyService.quantize('8.995'))).toBe('9.00');
    const hours = MoneyService.decimal(50).div(60);
    expect(MoneyService.format(MoneyService.quantize(hours.mul(1000)))).toBe('833.33');
  });
});

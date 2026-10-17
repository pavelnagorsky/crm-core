import { Prisma } from '@prisma/client';
import { MoneyUtils } from './money.utils.js';

describe('MoneyUtils', () => {
  it('allocates partial returns cumulatively and restores the full original amount', () => {
    const total = new Prisma.Decimal(100);
    const totalQuantity = new Prisma.Decimal(3);
    let allocated = new Prisma.Decimal(0);
    const amounts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const amount = MoneyUtils.allocateCumulative(
        total,
        totalQuantity,
        new Prisma.Decimal(1),
        new Prisma.Decimal(i),
        allocated,
      );
      allocated = allocated.plus(amount);
      amounts.push(amount.toFixed(2));
    }
    expect(amounts).toEqual(['33.33', '33.34', '33.33']);
    expect(allocated.toFixed(2)).toBe('100.00');
  });
  it('pads an exact amount and keeps arithmetic exact until quantize', () => {
    expect(MoneyUtils.format(20)).toBe('20.00');
    expect(MoneyUtils.format('9.5')).toBe('9.50');
    expect(MoneyUtils.format(null)).toBe('0.00');
    expect(MoneyUtils.format('-75.5')).toBe('-75.50');
    expect(MoneyUtils.decimal('1.10').plus('2.20').toString()).toBe('3.3');
    expect(MoneyUtils.format(MoneyUtils.decimal('1.10').plus('2.20'))).toBe(
      '3.30',
    );
  });

  it('accepts at most 2 fractional digits and leaves a longer fraction for validation', () => {
    expect(MoneyUtils.canonical('49')).toBe('49.00');
    expect(MoneyUtils.canonical('49.5')).toBe('49.50');
    expect(MoneyUtils.canonical(49.5)).toBe('49.50');
    expect(MoneyUtils.canonical('-12.5')).toBe('-12.50');
    expect(MoneyUtils.canonical('1.005')).toBe('1.005');
    expect(MoneyUtils.canonical('8.995')).toBe('8.995');
    expect(MoneyUtils.canonical('abc')).toBe('abc');
  });

  it('formats a currency label from the decimal string', () => {
    expect(MoneyUtils.formatCurrency('1500.50', 'RUB')).toBe(
      '1\u00a0500,50\u00a0₽',
    );
    expect(MoneyUtils.formatCurrency('0.00', 'BYN')).toBe('0,00\u00a0BYN');
    expect(MoneyUtils.formatCurrency('-75.50', 'USD')).toBe('-75,50\u00a0$');
    expect(MoneyUtils.formatCurrency('99999999.99', 'RUB')).toBe(
      '99\u00a0999\u00a0999,99\u00a0₽',
    );
  });

  it('quantizes half-up once', () => {
    expect(MoneyUtils.format(MoneyUtils.quantize('1.005'))).toBe('1.01');
    expect(MoneyUtils.format(MoneyUtils.quantize('8.995'))).toBe('9.00');
    const hours = MoneyUtils.decimal(50).div(60);
    expect(MoneyUtils.format(MoneyUtils.quantize(hours.mul(1000)))).toBe(
      '833.33',
    );
  });
});

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

  it('allocates rounding down, the part that completes the total takes the remainder', () => {
    const total = new Prisma.Decimal('10.00');
    const totalQuantity = new Prisma.Decimal(3);
    let allocated = new Prisma.Decimal(0);
    const amounts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const amount = MoneyUtils.allocateCumulativeDown(
        total,
        totalQuantity,
        new Prisma.Decimal(1),
        new Prisma.Decimal(i),
        allocated,
      );
      allocated = allocated.plus(amount);
      amounts.push(amount.toFixed(2));
    }
    expect(amounts).toEqual(['3.33', '3.33', '3.34']);
    expect(allocated.toFixed(2)).toBe('10.00');
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

  describe('minor units', () => {
    it.each([
      ['0', 0],
      ['0.01', 1],
      ['12.34', 1234],
      ['12.3', 1230],
      ['1.100', 110],
      ['-5.5', -550],
      ['60', 6000],
      ['99999999.99', 9999999999],
      ['90071992547409.91', Number.MAX_SAFE_INTEGER],
    ])('toMinor(%s) is exactly %i', (value, minor) => {
      expect(MoneyUtils.toMinor(value)).toBe(minor);
      expect(MoneyUtils.toMinor(new Prisma.Decimal(value))).toBe(minor);
    });

    it.each(['1.005', '0.001', '-12.345', '8.995'])(
      'toMinor rejects %s with more than 2 fractional digits instead of rounding',
      (value) => {
        expect(() => MoneyUtils.toMinor(value)).toThrow(RangeError);
      },
    );

    it.each(['90071992547409.92', '-90071992547409.92', '1e20'])(
      'toMinor rejects %s outside the safe integer range',
      (value) => {
        expect(() => MoneyUtils.toMinor(value)).toThrow(RangeError);
      },
    );

    it.each([
      [0, '0.00'],
      [1, '0.01'],
      [1234, '12.34'],
      [-550, '-5.50'],
      [9999999999, '99999999.99'],
      [Number.MAX_SAFE_INTEGER, '90071992547409.91'],
    ])('fromMinor(%i) is %s and converts back exactly', (minor, value) => {
      expect(MoneyUtils.fromMinor(minor).toFixed(2)).toBe(value);
      expect(MoneyUtils.toMinor(MoneyUtils.fromMinor(minor))).toBe(minor);
    });

    it.each([
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])('fromMinor rejects %s', (minor) => {
      expect(() => MoneyUtils.fromMinor(minor)).toThrow(RangeError);
    });
  });
});

import { Prisma } from '@prisma/client';
import { priceLine } from './line-pricing.js';

const d = (value: string) => new Prisma.Decimal(value);

/** Money of a line as fixed strings: list unit, list total, custom, unit, subtotal, discount, total. */
function money(line: ReturnType<typeof priceLine>): string[] {
  return [
    line.listUnitPrice.toFixed(2),
    line.listLineTotal.toFixed(2),
    line.customUnitPrice === null ? 'null' : line.customUnitPrice.toFixed(2),
    line.unitPrice.toFixed(2),
    line.lineSubtotal.toFixed(2),
    line.discountTotal.toFixed(2),
    line.lineTotal.toFixed(2),
  ];
}

describe('priceLine', () => {
  it.each<[string, string, string, string | null, string[]]>([
    [
      'list price',
      '3',
      '4.25',
      null,
      ['4.25', '12.75', 'null', '4.25', '12.75', '0.00', '12.75'],
    ],
    [
      'custom price',
      '2.500',
      '20.00',
      '15.00',
      ['20.00', '50.00', '15.00', '15.00', '37.50', '0.00', '37.50'],
    ],
    [
      'fractional quantity rounded to cents',
      '0.333',
      '10.00',
      null,
      ['10.00', '3.33', 'null', '10.00', '3.33', '0.00', '3.33'],
    ],
  ])(
    'without a line discount keeps the %s line undiscounted',
    (_case, quantity, list, custom, expected) => {
      expect(
        money(priceLine(d(quantity), d(list), custom === null ? null : d(custom))),
      ).toEqual(expected);
    },
  );

  it('treats an explicit zero discount like the default', () => {
    expect(money(priceLine(d('2'), d('30.00'), null, d('0')))).toEqual(
      money(priceLine(d('2'), d('30.00'), null)),
    );
  });

  it.each<[string, string, string, string, string[]]>([
    [
      'one unit',
      '1',
      '60.00',
      '10.00',
      ['60.00', '60.00', 'null', '60.00', '60.00', '10.00', '50.00'],
    ],
    [
      'the whole line of several units',
      '2',
      '60.00',
      '15.00',
      ['60.00', '120.00', 'null', '60.00', '120.00', '15.00', '105.00'],
    ],
    [
      'a discount rounded to cents',
      '1',
      '60.00',
      '10.005',
      ['60.00', '60.00', 'null', '60.00', '60.00', '10.01', '49.99'],
    ],
  ])(
    'subtracts a line discount from %s at the list price',
    (_case, quantity, list, discount, expected) => {
      expect(money(priceLine(d(quantity), d(list), null, d(discount)))).toEqual(
        expected,
      );
    },
  );

  it('ignores the line discount with a custom price', () => {
    expect(money(priceLine(d('1'), d('60.00'), d('45.00'), d('10.00')))).toEqual(
      ['60.00', '60.00', '45.00', '45.00', '45.00', '0.00', '45.00'],
    );
  });

  it('ignores the line discount with a zero custom price', () => {
    const line = priceLine(d('1'), d('60.00'), d('0'), d('10.00'));

    expect(line.discountTotal.toFixed(2)).toBe('0.00');
    expect(line.lineTotal.toFixed(2)).toBe('0.00');
  });
});

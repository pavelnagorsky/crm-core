import { OrderReturnStatus, Prisma } from '@prisma/client';
import { ReturnAllocationSource } from '../interfaces/return-allocation-source.interface.js';
import { allocateReturn, postedReturns } from './order-return-allocation.rules.js';

const d = (value: string | number) => new Prisma.Decimal(value);

function line(
  quantity: string,
  lineTotal: string,
  discountTotal: string,
  lineCost: string | null = null,
): ReturnAllocationSource {
  return {
    quantity: d(quantity),
    lineTotal: d(lineTotal),
    discountTotal: d(discountTotal),
    lineCostSnapshot: lineCost === null ? null : d(lineCost),
    returnItems: [],
  };
}

/** Applies a return to the line, as a posted return item. */
function returnFrom(
  source: ReturnAllocationSource,
  quantity: string,
  status: OrderReturnStatus = OrderReturnStatus.POSTED,
) {
  const allocation = allocateReturn(source, d(quantity));
  const next: ReturnAllocationSource = {
    ...source,
    returnItems: [
      ...source.returnItems,
      {
        quantity: d(quantity),
        lineTotal: allocation.lineTotal,
        discountTotal: allocation.discountTotal,
        lineCostSnapshot: allocation.lineCostSnapshot,
        return: { status },
      },
    ],
  };
  return { allocation, next };
}

describe('return allocation', () => {
  it('gives 3 pcs for 75 with 15 discount: 1 then 2 back as 25.00 and 50.00', () => {
    const first = returnFrom(line('3', '75.00', '15.00'), '1');
    expect(first.allocation.lineTotal.toFixed(2)).toBe('25.00');
    expect(first.allocation.discountTotal.toFixed(2)).toBe('5.00');
    expect(first.allocation.lineSubtotal.toFixed(2)).toBe('30.00');
    const second = returnFrom(first.next, '2');
    expect(second.allocation.lineTotal.toFixed(2)).toBe('50.00');
    expect(second.allocation.discountTotal.toFixed(2)).toBe('10.00');
    expect(second.allocation.lineSubtotal.toFixed(2)).toBe('60.00');
  });

  it('adds up to exactly the line on 1+1+1 with a 10.00 discount', () => {
    let source = line('3', '50.00', '10.00');
    const parts = [];
    for (let index = 0; index < 3; index += 1) {
      const step = returnFrom(source, '1');
      parts.push(step.allocation);
      source = step.next;
    }
    // The discount rounds down; the return that completes the line takes the remainder.
    expect(parts.map((part) => part.discountTotal.toFixed(2))).toEqual([
      '3.33',
      '3.33',
      '3.34',
    ]);
    expect(parts.map((part) => part.lineTotal.toFixed(2))).toEqual([
      '16.67',
      '16.66',
      '16.67',
    ]);
    const sum = postedReturns(source);
    expect(sum.lineTotal.toFixed(2)).toBe('50.00');
    expect(sum.discountTotal.toFixed(2)).toBe('10.00');
    expect(
      parts
        .reduce((total, part) => total.plus(part.lineSubtotal), d(0))
        .toFixed(2),
    ).toBe('60.00');
  });

  it('allocates fractional quantities and returns the exact rest at the end', () => {
    const first = returnFrom(line('0.750', '33.33', '3.70', '12.00'), '0.250');
    expect(first.allocation.lineTotal.toFixed(2)).toBe('11.11');
    expect(first.allocation.discountTotal.toFixed(2)).toBe('1.23');
    expect(first.allocation.lineCostSnapshot?.toFixed(2)).toBe('4.00');
    const rest = returnFrom(first.next, '0.500');
    expect(rest.allocation.lineTotal.toFixed(2)).toBe('22.22');
    expect(rest.allocation.discountTotal.toFixed(2)).toBe('2.47');
    expect(rest.allocation.lineCostSnapshot?.toFixed(2)).toBe('8.00');
  });

  it('ignores voided returns', () => {
    const voided = returnFrom(
      line('2', '40.00', '0.00'),
      '1',
      OrderReturnStatus.VOIDED,
    );
    expect(returnFrom(voided.next, '2').allocation.lineTotal.toFixed(2)).toBe(
      '40.00',
    );
  });

  it('keeps a custom price line without a discount', () => {
    const step = returnFrom(line('4', '30.00', '0.00'), '1');
    expect(step.allocation.lineTotal.toFixed(2)).toBe('7.50');
    expect(step.allocation.discountTotal.toFixed(2)).toBe('0.00');
    expect(step.allocation.lineSubtotal.toFixed(2)).toBe('7.50');
  });
});

import { NotSpecifiedSqlRow } from '../interfaces/not-specified-sql-row.interface.js';
import { notSpecifiedResult, notSpecifiedRow } from './not-specified.rules.js';

function row(overrides: Partial<NotSpecifiedSqlRow> = {}): NotSpecifiedSqlRow {
  return {
    kind: 'VISIT',
    orderId: 'order-1',
    bookingId: 'booking-1',
    bookingStatus: 'COMPLETED',
    at: new Date('2026-11-21T10:00:00.000Z'),
    clientName: 'Anna',
    staffNames: ['Boris', ' '],
    amountDue: '1500.00',
    draftProductsCount: 2,
    totalCount: 7n,
    totalAmount: '9000.00',
    ...overrides,
  };
}

describe('notSpecifiedRow', () => {
  it('maps the columns and drops blank staff names', () => {
    const mapped = notSpecifiedRow(row());
    expect(mapped.staffNames).toEqual(['Boris']);
    expect(mapped.amountDue.toFixed(2)).toBe('1500.00');
    expect(mapped.draftProductsCount).toBe(2);
    expect(mapped.bookingStatus).toBe('COMPLETED');
  });
});

describe('notSpecifiedResult', () => {
  it('sums a page shorter than the limit itself', () => {
    const result = notSpecifiedResult(
      [row(), row({ amountDue: '500.00' })],
      20,
    );
    expect(result.count).toBe(2);
    expect(result.amount.toFixed(2)).toBe('2000.00');
  });

  it('takes the totals of a full page from the window columns', () => {
    const result = notSpecifiedResult([row(), row()], 2);
    expect(result.items).toHaveLength(2);
    expect(result.count).toBe(7);
    expect(result.amount.toFixed(2)).toBe('9000.00');
  });

  it('is empty without rows', () => {
    const result = notSpecifiedResult([], 20);
    expect(result).toMatchObject({ items: [], count: 0 });
    expect(result.amount.toFixed(2)).toBe('0.00');
  });
});

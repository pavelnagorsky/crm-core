import { HttpStatus } from '@nestjs/common';
import { PriceChangeTarget, ServiceStatus } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeGroup } from '../interfaces/price-change-group.interface.js';
import { PriceChangeRow } from '../interfaces/price-change-row.interface.js';
import { selectPriceChangeRows } from './service-price-change-select.rules.js';

const row = (
  key: string,
  targetType: PriceChangeTarget,
  before: number,
  after: number,
  invalid = false,
): PriceChangeRow => ({
  key,
  targetType,
  levelId: null,
  levelName: null,
  staffId: null,
  staffName: null,
  before,
  after,
  invalid,
  checked: !invalid && before !== after,
  replacesScheduledDate: null,
});

const groups: PriceChangeGroup[] = [
  {
    kind: ServicePriceChangeGroupKind.SERVICE,
    id: 's1',
    title: 'Cut',
    categoryId: null,
    categoryName: null,
    status: ServiceStatus.ACTIVE,
    rows: [
      row('BASE:s1', PriceChangeTarget.BASE, 5000, 5500),
      row('LEVEL:s1:l1', PriceChangeTarget.LEVEL, 7000, 7000),
      row('STAFF:s1:st1', PriceChangeTarget.STAFF, 600, 0, true),
    ],
  },
];

function code(fn: () => unknown): { code: string; status: number; payload: unknown } {
  try {
    fn();
  } catch (error) {
    const e = error as AppException;
    return { code: e.errorCode, status: e.getStatus(), payload: e.payload };
  }
  throw new Error('did not throw');
}

describe('selectPriceChangeRows', () => {
  it('takes the selected rows and drops those that end at their old price', () => {
    const rows = selectPriceChangeRows(groups, ['BASE:s1', 'LEVEL:s1:l1'], []);
    expect(rows.map((r) => r.row.key)).toEqual(['BASE:s1']);
    expect(rows[0].after).toBe(5500);
  });

  it('applies manual prices, also to an invalid row, and a null removes a level price', () => {
    const rows = selectPriceChangeRows(
      groups,
      ['BASE:s1', 'LEVEL:s1:l1', 'STAFF:s1:st1'],
      [
        { key: 'BASE:s1', price: 6000 },
        { key: 'LEVEL:s1:l1', price: null },
        { key: 'STAFF:s1:st1', price: 700 },
      ],
    );
    expect(rows.map((r) => r.after)).toEqual([6000, null, 700]);
  });

  it('409 STALE with the keys the preview no longer has', () => {
    expect(
      code(() => selectPriceChangeRows(groups, ['BASE:s1', 'BASE:gone'], [])),
    ).toEqual({
      code: 'PRICE_CHANGE_STALE',
      status: HttpStatus.CONFLICT,
      payload: { keys: ['BASE:gone'] },
    });
    expect(
      code(() =>
        selectPriceChangeRows(groups, ['BASE:s1'], [{ key: 'LEVEL:x:y', price: 1 }]),
      ).payload,
    ).toEqual({ keys: ['LEVEL:x:y'] });
  });

  it('400 ROW_INVALID for a null base price, an override outside the selection, or an unedited invalid row', () => {
    expect(
      code(() => selectPriceChangeRows(groups, ['BASE:s1'], [{ key: 'BASE:s1', price: null }])),
    ).toMatchObject({ code: 'PRICE_CHANGE_ROW_INVALID', payload: { key: 'BASE:s1' } });
    expect(
      code(() => selectPriceChangeRows(groups, ['BASE:s1'], [{ key: 'LEVEL:s1:l1', price: 1 }])).payload,
    ).toEqual({ key: 'LEVEL:s1:l1' });
    expect(
      code(() => selectPriceChangeRows(groups, ['STAFF:s1:st1'], [])).payload,
    ).toEqual({ key: 'STAFF:s1:st1' });
    expect(
      code(() =>
        selectPriceChangeRows(groups, ['BASE:s1'], [{ key: 'BASE:s1', price: 10_000_000_000 }]),
      ).code,
    ).toBe('PRICE_CHANGE_ROW_INVALID');
  });

  it('400 EMPTY when nothing changes', () => {
    expect(
      code(() => selectPriceChangeRows(groups, ['LEVEL:s1:l1'], [])).code,
    ).toBe('PRICE_CHANGE_EMPTY');
  });
});

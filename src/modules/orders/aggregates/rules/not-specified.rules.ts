import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { BookingStatus } from '../../../bookings/enums/booking-status.enum.js';
import { NotSpecifiedResult } from '../interfaces/not-specified-result.interface.js';
import { NotSpecifiedRow } from '../interfaces/not-specified-row.interface.js';
import { NotSpecifiedSqlRow } from '../interfaces/not-specified-sql-row.interface.js';

/** A row of the "not specified" query in domain types; blank staff names are dropped. */
export function notSpecifiedRow(row: NotSpecifiedSqlRow): NotSpecifiedRow {
  return {
    kind: row.kind as NotSpecifiedRow['kind'],
    orderId: row.orderId,
    bookingId: row.bookingId,
    bookingStatus: row.bookingStatus as BookingStatus | null,
    at: new Date(row.at),
    clientName: row.clientName,
    staffNames: row.staffNames.filter((name) => name.trim()),
    amountDue: MoneyUtils.decimal(row.amountDue),
    draftProductsCount: Number(row.draftProductsCount),
  };
}

/**
 * The page of the "not specified" list with totals over all rows. A page shorter than
 * `limit` holds every row, so the totals are its own; a full page takes them from the
 * window columns.
 */
export function notSpecifiedResult(
  rows: readonly NotSpecifiedSqlRow[],
  limit: number,
): NotSpecifiedResult {
  const items = rows.map(notSpecifiedRow);
  if (rows.length === 0 || rows.length < limit)
    return {
      items,
      count: rows.length,
      amount: items.reduce(
        (sum, item) => sum.plus(item.amountDue),
        MoneyUtils.decimal(0),
      ),
    };
  return {
    items,
    count: Number(rows[0].totalCount),
    amount: MoneyUtils.decimal(rows[0].totalAmount),
  };
}

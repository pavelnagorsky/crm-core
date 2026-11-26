import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PRICE_MAX_MINOR } from '../constants/price-level-fill.constants.js';
import { PriceChangeOverride } from '../interfaces/price-change-override.interface.js';

function rowInvalid(key: string): AppException {
  return new AppException(
    ErrorCode.PRICE_CHANGE_ROW_INVALID,
    HttpStatus.BAD_REQUEST,
    { key },
  );
}

/**
 * The rows a create request asks for, over the freshly computed preview rows of either
 * catalog. Keys the recomputed preview does not have: 409 PRICE_CHANGE_STALE { keys }. An edit
 * that is out of range, removes a price that `removable` does not allow to remove, or is not
 * among the selected keys, and a selected invalid row left unedited: 400
 * PRICE_CHANGE_ROW_INVALID { key }. Rows that end at their old price are dropped; none left:
 * 400 PRICE_CHANGE_EMPTY.
 */
export function selectChangedRows<
  T extends {
    key: string;
    before: number | null;
    after: number | null;
    invalid: boolean;
  },
>(
  rows: readonly T[],
  selectedKeys: readonly string[],
  overrides: readonly PriceChangeOverride[],
  removable: (row: T) => boolean,
): { row: T; after: number | null }[] {
  const byKey = new Map(rows.map((row) => [row.key, row] as const));
  const keys = [...new Set(selectedKeys)];
  const stale = [
    ...new Set([...keys, ...overrides.map((item) => item.key)]),
  ].filter((key) => !byKey.has(key));
  if (stale.length > 0)
    throw new AppException(
      ErrorCode.PRICE_CHANGE_STALE,
      HttpStatus.CONFLICT,
      { keys: stale },
    );
  const selected = new Set(keys);
  const edits = new Map<string, number | null>();
  for (const { key, price } of overrides) {
    const row = byKey.get(key)!;
    if (
      !selected.has(key) ||
      edits.has(key) ||
      (price === null && !removable(row)) ||
      (price !== null && (price < 0 || price > PRICE_MAX_MINOR))
    )
      throw rowInvalid(key);
    edits.set(key, price);
  }
  const picked: { row: T; after: number | null }[] = [];
  for (const key of keys) {
    const row = byKey.get(key)!;
    if (!edits.has(key) && row.invalid) throw rowInvalid(key);
    const after = edits.has(key) ? edits.get(key)! : row.after;
    if (after !== row.before) picked.push({ row, after });
  }
  if (picked.length === 0)
    throw new AppException(
      ErrorCode.PRICE_CHANGE_EMPTY,
      HttpStatus.BAD_REQUEST,
    );
  return picked;
}

import { HttpStatus } from '@nestjs/common';
import { ServicePriceChangeTarget } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PRICE_MAX_MINOR } from '../constants/price-level-fill.constants.js';
import { PriceChangeGroup } from '../interfaces/price-change-group.interface.js';
import { PriceChangeOverride } from '../interfaces/price-change-override.interface.js';
import { PriceChangeSelectedRow } from '../interfaces/price-change-selected-row.interface.js';

function rowInvalid(key: string): AppException {
  return new AppException(
    ErrorCode.SERVICE_PRICE_CHANGE_ROW_INVALID,
    HttpStatus.BAD_REQUEST,
    { key },
  );
}

/**
 * The rows a create request asks for, over the freshly computed preview. Keys the
 * recomputed preview does not have: 409 SERVICE_PRICE_CHANGE_STALE { keys }. An edit that
 * is out of range, removes a base or bundle price, or is not among the selected keys, and a
 * selected invalid row left unedited: 400 SERVICE_PRICE_CHANGE_ROW_INVALID { key }. Rows
 * that end at their old price are dropped; none left: 400 SERVICE_PRICE_CHANGE_EMPTY.
 */
export function selectPriceChangeRows(
  groups: readonly PriceChangeGroup[],
  selectedKeys: readonly string[],
  overrides: readonly PriceChangeOverride[],
): PriceChangeSelectedRow[] {
  const byKey = new Map(
    groups.flatMap((group) =>
      group.rows.map((row) => [row.key, { group, row }] as const),
    ),
  );
  const keys = [...new Set(selectedKeys)];
  const stale = [
    ...new Set([...keys, ...overrides.map((item) => item.key)]),
  ].filter((key) => !byKey.has(key));
  if (stale.length > 0)
    throw new AppException(
      ErrorCode.SERVICE_PRICE_CHANGE_STALE,
      HttpStatus.CONFLICT,
      { keys: stale },
    );
  const selected = new Set(keys);
  const edits = new Map<string, number | null>();
  for (const { key, price } of overrides) {
    const { row } = byKey.get(key)!;
    const removable =
      row.targetType === ServicePriceChangeTarget.LEVEL ||
      row.targetType === ServicePriceChangeTarget.STAFF;
    if (
      !selected.has(key) ||
      edits.has(key) ||
      (price === null && !removable) ||
      (price !== null && (price < 0 || price > PRICE_MAX_MINOR))
    )
      throw rowInvalid(key);
    edits.set(key, price);
  }
  const rows: PriceChangeSelectedRow[] = [];
  for (const key of keys) {
    const { group, row } = byKey.get(key)!;
    if (!edits.has(key) && row.invalid) throw rowInvalid(key);
    const after = edits.has(key) ? edits.get(key)! : row.after;
    if (after !== row.before) rows.push({ group, row, after });
  }
  if (rows.length === 0)
    throw new AppException(
      ErrorCode.SERVICE_PRICE_CHANGE_EMPTY,
      HttpStatus.BAD_REQUEST,
    );
  return rows;
}

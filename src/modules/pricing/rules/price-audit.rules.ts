import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { AuditFieldChange } from '../../audit/interfaces/audit-field-change.interface.js';

const NO_PRICE = '—';

const label = (price: Prisma.Decimal | string | null | undefined): string =>
  price == null ? NO_PRICE : MoneyUtils.format(price);

/**
 * Audit lines for the prices that really changed; the field is the name of the thing priced.
 * Ids missing from `before` count as having no price.
 */
export function priceChanges(
  names: ReadonlyMap<string, string>,
  before: ReadonlyMap<string, Prisma.Decimal | null>,
  after: ReadonlyMap<string, string | null>,
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const [id, price] of after) {
    const from = label(before.get(id));
    const to = label(price);
    if (from !== to) changes.push({ field: names.get(id) ?? id, from, to });
  }
  return changes;
}

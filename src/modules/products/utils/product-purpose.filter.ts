import { Prisma } from '@prisma/client';
import { ProductPurpose } from '../enums/product-purpose.enum.js';

const PURPOSE_COLUMN: Record<ProductPurpose, 'isForSale' | 'isForInternalUse'> =
  {
    [ProductPurpose.SALE]: 'isForSale',
    [ProductPurpose.INTERNAL]: 'isForInternalUse',
  };

/** Prisma `Product` condition for a purpose filter; empty when no filter is set. */
export function productPurposeWhere(
  purpose: ProductPurpose | undefined,
): Prisma.ProductWhereInput {
  return purpose ? { [PURPOSE_COLUMN[purpose]]: true } : {};
}

/**
 * Raw SQL condition for a purpose filter; `TRUE` when no filter is set.
 * Pass `'p'` when `Product` is joined as `p`; omit it for a view that projects
 * the purpose columns unqualified. The alias is a fixed literal, never user input.
 */
export function productPurposeSql(
  purpose: ProductPurpose | undefined,
  alias?: 'p',
): Prisma.Sql {
  if (!purpose) return Prisma.sql`TRUE`;
  const column = `"${PURPOSE_COLUMN[purpose]}"`;
  return Prisma.raw(alias ? `${alias}.${column} = true` : `${column} = true`);
}

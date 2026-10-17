import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { CreateOrderDto } from '../dto/create-order.dto.js';

/** Hash the customer's intent, before mutable catalog prices or default dates are resolved. */
export function saleRequestHash(
  locationId: string,
  dto: CreateOrderDto,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        locationId,
        clientId: dto.clientId ?? null,
        occurredAt: dto.occurredAt
          ? new Date(dto.occurredAt).toISOString()
          : null,
        note: dto.note?.trim() || null,
        items: dto.items
          .map((item) => ({
            productId: item.productId,
            quantity: new Prisma.Decimal(item.quantity).toString(),
            customUnitPrice:
              item.customUnitPrice == null
                ? null
                : new Prisma.Decimal(item.customUnitPrice).toString(),
            sellerStaffId: item.sellerStaffId ?? null,
          }))
          .sort((left, right) => left.productId.localeCompare(right.productId)),
      }),
    )
    .digest('hex');
}

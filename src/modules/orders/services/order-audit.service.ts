import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';

@Injectable()
export class OrderAuditService {
  constructor(private readonly audit: AuditService) {}

  async write(
    tx: Prisma.TransactionClient,
    event: {
      brandId: string;
      locationId: string;
      entityId: string;
      eventType: AuditEvent;
      actionType: AuditActionType;
      actor: AuditActor;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.audit.writeInTransaction(tx, {
      brandId: event.brandId,
      locationId: event.locationId,
      entityType: AuditEntity.ORDER,
      entityId: event.entityId,
      eventType: event.eventType,
      actionType: event.actionType,
      occurredAt: new Date(),
      actor: event.actor,
      payload: event.payload,
    });
  }

  writeUpdated(
    tx: Prisma.TransactionClient,
    event: {
      brandId: string;
      locationId: string;
      entityId: string;
      actor: AuditActor;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    return this.write(tx, {
      ...event,
      eventType: AuditEvent.ORDER_UPDATED,
      actionType: AuditActionType.MODIFY,
    });
  }

  itemSnapshot(
    item:
      | OrderWithItems['items'][number]
      | Prisma.OrderItemUncheckedCreateWithoutOrderInput,
  ) {
    return {
      productId: item.catalogItemId,
      title: item.title,
      quantity: this.decimalValue(item.quantity, 3),
      unitPrice: this.decimalValue(item.unitPrice, 2),
      customUnitPrice: this.decimalValue(item.customUnitPrice, 2),
      lineTotal: this.decimalValue(item.lineTotal, 2),
      sellerStaffId: item.sellerStaffId ?? null,
      sellerName: item.sellerName ?? null,
    };
  }

  private decimalValue(value: unknown, decimals: number): string | null {
    if (value == null) return null;
    return new Prisma.Decimal(value as Prisma.Decimal.Value).toFixed(decimals);
  }
}

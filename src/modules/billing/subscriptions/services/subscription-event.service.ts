import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Subscription,
  SubscriptionEvent,
  SubscriptionEventType,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { stableOrderBy } from '../../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { EventPayload } from '../../compute/event-payload.js';
import { SubscriptionEventsRequestDto } from '../../dto/subscription-events-request.dto.js';
import { SubscriptionEventOrderBy } from '../../enums/subscription-event-order-by.enum.js';
import { BillingActor } from '../../interfaces/billing-actor.interface.js';
import { SubscriptionEventEntry } from '../../interfaces/subscription-event-entry.interface.js';

type Tx = Prisma.TransactionClient;

/** Owns SubscriptionEvent: the audit trail of every subscription change. */
@Injectable()
export class SubscriptionEventService {
  constructor(private readonly db: DatabaseService) {}

  async record(
    subscription: Pick<Subscription, 'id' | 'brandId'>,
    type: SubscriptionEventType,
    actor: BillingActor,
    payload: Record<string, unknown>,
    tx: Tx,
  ): Promise<void> {
    await tx.subscriptionEvent.create({
      data: this.row(subscription, type, actor, payload),
    });
  }

  /** One event type for many subscriptions in a single insert. */
  async recordMany(
    entries: SubscriptionEventEntry[],
    type: SubscriptionEventType,
    actor: BillingActor,
    tx: Tx,
  ): Promise<void> {
    if (!entries.length) return;
    await tx.subscriptionEvent.createMany({
      data: entries.map((e) =>
        this.row(e.subscription, type, actor, e.payload),
      ),
    });
  }

  async search(
    subscriptionId: string,
    dto: SubscriptionEventsRequestDto,
  ): Promise<PaginatedResult<SubscriptionEvent>> {
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const where: Prisma.SubscriptionEventWhereInput = { subscriptionId };
    const [items, totalItems] = await this.db.$transaction([
      this.db.subscriptionEvent.findMany({
        where,
        orderBy: stableOrderBy(
          { [dto.orderBy ?? SubscriptionEventOrderBy.CREATED_AT]: direction },
          direction,
        ),
        skip: dto.isExport ? undefined : (dto.page - 1) * dto.pageSize,
        take: dto.isExport ? undefined : dto.pageSize,
      }),
      this.db.subscriptionEvent.count({ where }),
    ]);
    return { items, totalItems };
  }

  findRecent(
    subscriptionId: string,
    take: number,
  ): Promise<SubscriptionEvent[]> {
    return this.db.subscriptionEvent.findMany({
      where: { subscriptionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  private row(
    subscription: Pick<Subscription, 'id' | 'brandId'>,
    type: SubscriptionEventType,
    actor: BillingActor,
    payload: Record<string, unknown>,
  ): Prisma.SubscriptionEventUncheckedCreateInput {
    return {
      subscriptionId: subscription.id,
      brandId: subscription.brandId,
      type,
      actorId: actor.id,
      actorRole: actor.role,
      payload: EventPayload.of(payload),
    };
  }
}

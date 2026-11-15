import { ApiProperty } from '@nestjs/swagger';
import {
  BillingActorRole,
  SubscriptionEvent,
  SubscriptionEventType,
} from '@prisma/client';

export class SubscriptionEventDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: SubscriptionEventType,
    enumName: 'SubscriptionEventType',
  })
  type: SubscriptionEventType;

  @ApiProperty({ enum: BillingActorRole, enumName: 'BillingActorRole' })
  actorRole: BillingActorRole;

  @ApiProperty({
    type: Object,
    description:
      'Event details: dates as ISO strings, amounts as 2dp strings. Keys depend on the type',
  })
  payload: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  /** Owner view: the admin note stays with the platform. */
  static fromEntity(event: SubscriptionEvent): SubscriptionEventDto {
    const { adminNote: _adminNote, ...payload } =
      SubscriptionEventDto.payload(event);
    return SubscriptionEventDto.build(
      new SubscriptionEventDto(),
      event,
      payload,
    );
  }

  protected static payload(event: SubscriptionEvent): Record<string, unknown> {
    return (event.payload ?? {}) as Record<string, unknown>;
  }

  protected static build<T extends SubscriptionEventDto>(
    dto: T,
    event: SubscriptionEvent,
    payload: Record<string, unknown>,
  ): T {
    return Object.assign(dto, {
      id: event.id,
      type: event.type,
      actorRole: event.actorRole,
      payload,
      createdAt: event.createdAt,
    });
  }
}

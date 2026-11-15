import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionEvent } from '@prisma/client';
import { SubscriptionEventDto } from './subscription-event.dto.js';

export class AdminSubscriptionEventDto extends SubscriptionEventDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  actorId: string | null;

  /** Full payload, admin note included. */
  static fromEntity(event: SubscriptionEvent): AdminSubscriptionEventDto {
    const dto = SubscriptionEventDto.build(
      new AdminSubscriptionEventDto(),
      event,
      SubscriptionEventDto.payload(event),
    );
    dto.actorId = event.actorId;
    return dto;
  }
}

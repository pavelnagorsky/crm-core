import { ApiProperty } from '@nestjs/swagger';
import { EmailEventType, EmailMessageEvent } from '@prisma/client';

export class EmailMessageEventDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: EmailEventType, enumName: 'EmailEventType' })
  type: EmailEventType;

  @ApiProperty({ type: Number, nullable: true })
  attempt: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt: Date;

  @ApiProperty({ type: Number, nullable: true })
  durationMs: number | null;

  @ApiProperty({ type: String, nullable: true })
  error: string | null;

  @ApiProperty({ type: Number, nullable: true })
  errorCode: number | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Admin who retried or cancelled; null for the system',
  })
  actorId: string | null;

  @ApiProperty({ type: String, nullable: true })
  actorName: string | null;

  static from(
    event: EmailMessageEvent,
    actorNames: Map<string, string>,
  ): EmailMessageEventDto {
    return {
      id: event.id,
      type: event.type,
      attempt: event.attempt,
      occurredAt: event.occurredAt,
      durationMs: event.durationMs,
      error: event.error,
      errorCode: event.errorCode,
      actorId: event.actorId,
      actorName: event.actorId ? (actorNames.get(event.actorId) ?? null) : null,
    };
  }
}

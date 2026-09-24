import { ApiProperty } from '@nestjs/swagger';
import { AuditLog } from '@prisma/client';
import { AuditEvent } from '../enums/audit-event.enum.js';
import { AuditActionType } from '../enums/audit-action-type.enum.js';
import { AuditActorRole } from '../enums/audit-actor-role.enum.js';

export class AuditLogItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: AuditEvent })
  eventType: AuditEvent;

  @ApiProperty({ description: 'Localized title of eventType' })
  eventTypeTitle: string;

  @ApiProperty({ enum: AuditActionType })
  actionType: AuditActionType;

  @ApiProperty()
  actorName: string;

  @ApiProperty({ enum: AuditActorRole })
  actorRole: AuditActorRole;

  @ApiProperty({ description: 'Rendered HTML describing the event' })
  html: string;

  @ApiProperty()
  occurredAt: Date;

  static fromEntity(log: AuditLog, html: string, eventTypeTitle: string): AuditLogItemDto {
    const dto = new AuditLogItemDto();
    dto.id = log.id;
    dto.eventType = log.eventType as AuditEvent;
    dto.eventTypeTitle = eventTypeTitle;
    dto.actionType = log.actionType as AuditActionType;
    dto.actorName = log.actorName;
    dto.actorRole = log.actorRole as AuditActorRole;
    dto.html = html;
    dto.occurredAt = log.occurredAt;
    return dto;
  }
}

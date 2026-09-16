import { ApiProperty } from '@nestjs/swagger';
import { AuditLog } from '@prisma/client';
import { AuditEntity } from '../enums/audit-entity.enum.js';
import { AuditEvent } from '../enums/audit-event.enum.js';
import { AuditActorRole } from '../enums/audit-actor-role.enum.js';

export class AuditLogItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: AuditEvent })
  eventType: AuditEvent;

  @ApiProperty()
  actorName: string;

  @ApiProperty({ enum: AuditActorRole })
  actorRole: AuditActorRole;

  @ApiProperty({ description: 'Rendered HTML describing the event' })
  html: string;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(log: AuditLog, html: string): AuditLogItemDto {
    const dto = new AuditLogItemDto();
    dto.id = log.id;
    dto.eventType = log.eventType as AuditEvent;
    dto.actorName = log.actorName;
    dto.actorRole = log.actorRole as AuditActorRole;
    dto.html = html;
    dto.createdAt = log.createdAt;
    return dto;
  }
}

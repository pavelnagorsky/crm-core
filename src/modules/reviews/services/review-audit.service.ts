import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Review } from '@prisma/client';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { reviewAuditChanges } from '../rules/review-audit.rules.js';

interface ReviewAuditInput {
  actor: AuditActor;
  eventType: AuditEvent;
  actionType: AuditActionType;
  /** Null when the review was just created. */
  before: Review | null;
  /** Null when the review was deleted. */
  after: Review | null;
}

@Injectable()
export class ReviewAuditService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit({ actor, eventType, actionType, before, after }: ReviewAuditInput) {
    const review = after ?? before;
    if (!review) return;
    const author = [review.authorFirstName, review.authorLastName]
      .filter(Boolean)
      .join(' ');
    this.eventEmitter.emit(AUDIT_EVENT, {
      locationId: review.locationId,
      entityType: AuditEntity.REVIEW,
      entityId: review.id,
      eventType,
      actionType,
      occurredAt: new Date(),
      actor,
      payload: {
        title: author || '—',
        changes: reviewAuditChanges(before, after),
      },
    } satisfies AuditLogEvent);
  }
}

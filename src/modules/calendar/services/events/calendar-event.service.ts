import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CalendarEvent,
  CalendarEventRepeatType,
  CalendarEventType,
  Prisma,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../../shared/database/active-business.where.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
import {
  auditSnapshot,
  auditSnapshotChanges,
} from '../../../audit/utils/audit-snapshot.js';
import { CreateCalendarEventDto } from '../../dto/create-calendar-event.dto.js';
import { DeleteCalendarEventDto } from '../../dto/delete-calendar-event.dto.js';
import { MoveCalendarEventDto } from '../../dto/move-calendar-event.dto.js';
import { UpdateCalendarEventDto } from '../../dto/update-calendar-event.dto.js';

@Injectable()
export class CalendarEventService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    locationId: string,
    dto: CreateCalendarEventDto,
    actor: AuditActor,
  ): Promise<CalendarEvent[]> {
    const staffIds = dto.staffIds?.length ? dto.staffIds : [null];
    const events = await this.db.$transaction(
      staffIds.map((staffId) =>
        this.db.calendarEvent.create({
          data: this.buildEventData(locationId, dto, staffId),
        }),
      ),
    );

    for (const event of events) {
      this.record(AuditEvent.CALENDAR_BLOCK_CREATED, null, event, actor);
    }

    return events;
  }

  async update(
    locationId: string,
    eventId: string,
    dto: UpdateCalendarEventDto,
    actor: AuditActor,
  ): Promise<CalendarEvent> {
    const event = await this.findInLocation(locationId, eventId);
    if (!dto.thisOnly) {
      const updated = await this.db.calendarEvent.update({
        where: { id: eventId },
        data: this.buildEventData(
          event.locationId,
          dto,
          dto.staffId !== undefined ? dto.staffId : event.staffId,
        ),
      });
      this.record(AuditEvent.CALENDAR_BLOCK_UPDATED, event, updated, actor);
      return updated;
    }
    const updated = await this.db.$transaction(async (tx) => {
      const occurrenceDate = new Date(dto.occurrenceDate!);
      await tx.calendarEventCancelledOccurrence.upsert({
        where: { eventId_occurrenceDate: { eventId, occurrenceDate } },
        create: { eventId, occurrenceDate },
        update: {},
      });
      return tx.calendarEvent.create({
        data: {
          ...this.buildEventData(
            event.locationId,
            dto,
            dto.staffId !== undefined ? dto.staffId : event.staffId,
          ),
          repeatType: CalendarEventRepeatType.NONE,
          daysMask: null,
          repeatUntil: null,
        },
      });
    });
    this.record(
      AuditEvent.CALENDAR_BLOCK_UPDATED,
      event,
      updated,
      actor,
      dto.occurrenceDate,
    );
    return updated;
  }

  async delete(
    locationId: string,
    eventId: string,
    dto: DeleteCalendarEventDto,
    actor: AuditActor,
  ): Promise<void> {
    const event = await this.findInLocation(locationId, eventId);
    if (dto.thisOnly) {
      const occurrenceDate = new Date(dto.occurrenceDate!);
      const cancellation =
        await this.db.calendarEventCancelledOccurrence.createMany({
          data: [{ eventId, occurrenceDate }],
          skipDuplicates: true,
        });
      if (cancellation.count === 0) return;
      this.record(
        AuditEvent.CALENDAR_BLOCK_DELETED,
        event,
        null,
        actor,
        dto.occurrenceDate,
      );
      return;
    }
    await this.db.calendarEvent.delete({ where: { id: eventId } });
    this.record(AuditEvent.CALENDAR_BLOCK_DELETED, event, null, actor);
  }

  async findInLocation(
    locationId: string,
    eventId: string,
  ): Promise<CalendarEvent> {
    const event = await this.db.calendarEvent.findFirst({
      where: { location: ACTIVE_LOCATION_WHERE, id: eventId, locationId },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  async moveOccurrence(
    locationId: string,
    eventId: string,
    dto: MoveCalendarEventDto,
    actor: AuditActor,
  ): Promise<CalendarEvent> {
    const event = await this.findInLocation(locationId, eventId);
    const startDateTime = new Date(dto.startDateTime);
    const endDateTime = new Date(dto.endDateTime);
    if (!dto.thisOnly) {
      const updated = await this.db.calendarEvent.update({
        where: { id: eventId },
        data: { startDateTime, endDateTime },
      });
      this.record(AuditEvent.CALENDAR_BLOCK_MOVED, event, updated, actor);
      return updated;
    }
    const occurrenceDate = new Date(dto.occurrenceDate!);
    const updated = await this.db.$transaction(async (tx) => {
      await tx.calendarEventCancelledOccurrence.upsert({
        where: { eventId_occurrenceDate: { eventId, occurrenceDate } },
        create: { eventId, occurrenceDate },
        update: {},
      });
      return tx.calendarEvent.create({
        data: {
          locationId: event.locationId,
          staffId: event.staffId,
          type: CalendarEventType.BLOCK,
          reason: event.reason,
          title: event.title,
          notes: event.notes,
          repeatType: CalendarEventRepeatType.NONE,
          startDateTime,
          endDateTime,
          daysMask: null,
          repeatUntil: null,
        },
      });
    });
    this.record(
      AuditEvent.CALENDAR_BLOCK_MOVED,
      event,
      updated,
      actor,
      dto.occurrenceDate,
    );
    return updated;
  }

  private record(
    eventType: AuditEvent,
    before: CalendarEvent | null,
    after: CalendarEvent | null,
    actor: AuditActor,
    occurrenceDate?: string | null,
  ): void {
    const event = after ?? before!;
    const fields = [
      'staffId',
      'title',
      'reason',
      'notes',
      'repeatType',
      'startDateTime',
      'endDateTime',
      'daysMask',
      'repeatUntil',
    ] as const satisfies readonly (keyof CalendarEvent)[];
    const changes =
      before && after
        ? auditSnapshotChanges(
            auditSnapshot(before, fields),
            auditSnapshot(after, fields),
          )
        : undefined;
    if (before && after && !occurrenceDate && changes?.length === 0) return;
    const targets = new Map<
      string,
      Pick<AuditLogEvent, 'entityType' | 'entityId'>
    >();
    const currentTarget = {
      entityType: event.staffId ? AuditEntity.STAFF : AuditEntity.CALENDAR,
      entityId: event.staffId ?? before?.id ?? event.id,
    };
    targets.set(
      `${currentTarget.entityType}:${currentTarget.entityId}`,
      currentTarget,
    );
    if (before) {
      const previousTarget = {
        entityType: before.staffId ? AuditEntity.STAFF : AuditEntity.CALENDAR,
        entityId: before.staffId ?? before.id,
      };
      targets.set(
        `${previousTarget.entityType}:${previousTarget.entityId}`,
        previousTarget,
      );
    }
    for (const target of targets.values())
      this.eventEmitter.emit(AUDIT_EVENT, {
        locationId: event.locationId,
        ...target,
        eventType,
        actionType:
          before == null
            ? AuditActionType.CREATE
            : after == null
              ? AuditActionType.DELETE
              : AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: {
          title: event.title ?? 'Блокировка',
          changes:
            changes ??
            Object.entries(auditSnapshot(event, fields)).map(
              ([field, value]) => ({
                field,
                from: before == null ? '—' : (value ?? '—'),
                to: after == null ? '—' : (value ?? '—'),
              }),
            ),
          occurrenceDate: occurrenceDate ?? undefined,
        },
      } satisfies AuditLogEvent);
  }

  private buildEventData(
    locationId: string,
    dto: CreateCalendarEventDto | UpdateCalendarEventDto,
    staffId?: string | null,
  ): Prisma.CalendarEventUncheckedCreateInput {
    return {
      locationId,
      staffId: staffId ?? null,
      type: CalendarEventType.BLOCK,
      reason: dto.reason ?? null,
      title: dto.title ?? null,
      notes: dto.notes ?? null,
      repeatType: dto.repeatType,
      startDateTime: new Date(dto.startDateTime),
      endDateTime: new Date(dto.endDateTime),
      daysMask: dto.daysMask ?? null,
      repeatUntil: dto.repeatUntil ? new Date(dto.repeatUntil) : null,
    };
  }
}

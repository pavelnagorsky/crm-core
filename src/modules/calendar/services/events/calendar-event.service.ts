import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CalendarEvent,
  CalendarEventRepeatType,
  CalendarEventType,
  Prisma,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../../database/database.service.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
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
      if (!event.staffId) continue;
      const audit: AuditLogEvent = {
        locationId,
        entityType: AuditEntity.STAFF,
        entityId: event.staffId,
        eventType: AuditEvent.STAFF_BLOCK_CREATED,
        actionType: AuditActionType.CREATE,
        occurredAt: new Date(),
        actor,
        payload: {
          startDateTime: dto.startDateTime,
          endDateTime: dto.endDateTime,
          title: dto.title ?? null,
          reason: dto.reason ?? null,
        },
      };
      this.eventEmitter.emit(AUDIT_EVENT, audit);
    }

    return events;
  }

  async update(
    locationId: string,
    eventId: string,
    dto: UpdateCalendarEventDto,
  ): Promise<CalendarEvent> {
    const event = await this.findInLocation(locationId, eventId);
    if (!dto.thisOnly) {
      return this.db.calendarEvent.update({
        where: { id: eventId },
        data: this.buildEventData(
          event.locationId,
          dto,
          dto.staffId !== undefined ? dto.staffId : event.staffId,
        ),
      });
    }
    return this.db.$transaction(async (tx) => {
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
  }

  async delete(
    locationId: string,
    eventId: string,
    dto: DeleteCalendarEventDto,
  ): Promise<void> {
    await this.findInLocation(locationId, eventId);
    if (dto.thisOnly) {
      const occurrenceDate = new Date(dto.occurrenceDate!);
      await this.db.calendarEventCancelledOccurrence.upsert({
        where: { eventId_occurrenceDate: { eventId, occurrenceDate } },
        create: { eventId, occurrenceDate },
        update: {},
      });
      return;
    }
    await this.db.calendarEvent.delete({ where: { id: eventId } });
  }

  async findInLocation(
    locationId: string,
    eventId: string,
  ): Promise<CalendarEvent> {
    const event = await this.db.calendarEvent.findFirst({
      where: { id: eventId, locationId },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  async moveOccurrence(
    locationId: string,
    eventId: string,
    dto: MoveCalendarEventDto,
  ): Promise<CalendarEvent> {
    const event = await this.findInLocation(locationId, eventId);
    const startDateTime = new Date(dto.startDateTime);
    const endDateTime = new Date(dto.endDateTime);
    if (!dto.thisOnly) {
      return this.db.calendarEvent.update({
        where: { id: eventId },
        data: { startDateTime, endDateTime },
      });
    }
    const occurrenceDate = new Date(dto.occurrenceDate!);
    return this.db.$transaction(async (tx) => {
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

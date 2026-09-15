import { Injectable, NotFoundException } from '@nestjs/common';
import { CalendarEvent } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';
import { DeleteCalendarEventDto } from './dto/delete-calendar-event.dto.js';

@Injectable()
export class CalendarService {
  constructor(private readonly db: DatabaseService) {}

  async create(businessId: string, dto: CreateCalendarEventDto): Promise<CalendarEvent[]> {
    const staffIds = dto.staffIds?.length ? dto.staffIds : [null];

    return this.db.$transaction(
      staffIds.map((staffId) =>
        this.db.calendarEvent.create({
          data: {
            businessId,
            staffId: staffId ?? null,
            type: dto.type,
            reason: dto.reason ?? null,
            title: dto.title ?? null,
            notes: dto.notes ?? null,
            repeatType: dto.repeatType,
            startDateTime: new Date(dto.startDateTime),
            endDateTime: new Date(dto.endDateTime),
            daysMask: dto.daysMask ?? null,
            repeatUntil: dto.repeatUntil ? new Date(dto.repeatUntil) : null,
          },
        }),
      ),
    );
  }

  async update(eventId: string, dto: UpdateCalendarEventDto): Promise<CalendarEvent> {
    const event = await this.findById(eventId);

    if (dto.thisOnly) {
      // Cancel the original occurrence and create a standalone replacement
      const occurrenceDate = new Date(dto.occurrenceDate!);

      return this.db.$transaction(async (tx) => {
        await tx.calendarEventCancelledOccurrence.upsert({
          where: { eventId_occurrenceDate: { eventId, occurrenceDate } },
          create: { eventId, occurrenceDate },
          update: {},
        });

        return tx.calendarEvent.create({
          data: {
            businessId: event.businessId,
            staffId: dto.staffId !== undefined ? dto.staffId : event.staffId,
            type: dto.type,
            reason: dto.reason ?? null,
            title: dto.title ?? null,
            notes: dto.notes ?? null,
            repeatType: dto.repeatType,
            startDateTime: new Date(dto.startDateTime),
            endDateTime: new Date(dto.endDateTime),
            daysMask: dto.daysMask ?? null,
            repeatUntil: dto.repeatUntil ? new Date(dto.repeatUntil) : null,
          },
        });
      });
    }

    return this.db.calendarEvent.update({
      where: { id: eventId },
      data: {
        staffId: dto.staffId !== undefined ? dto.staffId : event.staffId,
        type: dto.type,
        reason: dto.reason ?? null,
        title: dto.title ?? null,
        notes: dto.notes ?? null,
        repeatType: dto.repeatType,
        startDateTime: new Date(dto.startDateTime),
        endDateTime: new Date(dto.endDateTime),
        daysMask: dto.daysMask ?? null,
        repeatUntil: dto.repeatUntil ? new Date(dto.repeatUntil) : null,
      },
    });
  }

  async delete(eventId: string, dto: DeleteCalendarEventDto): Promise<void> {
    await this.findById(eventId);

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

  async findById(eventId: string): Promise<CalendarEvent> {
    const event = await this.db.calendarEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }
}

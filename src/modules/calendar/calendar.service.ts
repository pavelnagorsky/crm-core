import { Injectable } from '@nestjs/common';
import { CalendarEvent, Prisma } from '@prisma/client';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AvailableSlotsDayDto } from './dto/available-slots-day.dto.js';
import { AvailableSlotsRequestDto } from './dto/available-slots-request.dto.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { DeleteCalendarEventDto } from './dto/delete-calendar-event.dto.js';
import { GetCalendarRequestDto } from './dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from './dto/get-calendar-response.dto.js';
import { ManualAvailableSlotsRequestDto } from './dto/manual-available-slots-request.dto.js';
import { MoveCalendarEventDto } from './dto/move-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';
import { BookingCalendarEventInput } from './interfaces/booking-calendar-event-input.interface.js';
import { CalendarBookingFeed } from './interfaces/calendar-booking-feed.interface.js';
import { CalendarEventWithCancellations } from './interfaces/calendar-types.interface.js';
import { CalendarAvailabilityService } from './services/availability/calendar-availability.service.js';
import { BookingCalendarEventService } from './services/events/booking-calendar-event.service.js';
import { CalendarEventService } from './services/events/calendar-event.service.js';
import { CalendarViewBuilderService } from './services/view/calendar-view-builder.service.js';

@Injectable()
export class CalendarService {
  constructor(
    private readonly events: CalendarEventService,
    private readonly bookingEvents: BookingCalendarEventService,
    private readonly availability: CalendarAvailabilityService,
    private readonly viewBuilder: CalendarViewBuilderService,
  ) {}

  create(
    locationId: string,
    dto: CreateCalendarEventDto,
    actor: AuditActor,
  ): Promise<CalendarEvent[]> {
    return this.events.create(locationId, dto, actor);
  }

  update(
    locationId: string,
    eventId: string,
    dto: UpdateCalendarEventDto,
  ): Promise<CalendarEvent> {
    return this.events.update(locationId, eventId, dto);
  }

  delete(
    locationId: string,
    eventId: string,
    dto: DeleteCalendarEventDto,
  ): Promise<void> {
    return this.events.delete(locationId, eventId, dto);
  }

  findInLocation(locationId: string, eventId: string): Promise<CalendarEvent> {
    return this.events.findInLocation(locationId, eventId);
  }

  listBlockingEvents(
    locationId: string,
    staffIds: string[],
    startAt: Date,
    endAt: Date,
    excludedEventIds: string[] = [],
    tx?: Prisma.TransactionClient,
  ): Promise<CalendarEventWithCancellations[]> {
    return this.bookingEvents.listBlockingEvents(
      locationId,
      staffIds,
      startAt,
      endAt,
      excludedEventIds,
      tx,
    );
  }

  createBookingEvent(
    input: BookingCalendarEventInput,
    tx: Prisma.TransactionClient,
  ): Promise<CalendarEvent> {
    return this.bookingEvents.createBookingEvent(input, tx);
  }

  saveBookingEvent(
    input: BookingCalendarEventInput,
    tx: Prisma.TransactionClient,
  ): Promise<CalendarEvent> {
    return this.bookingEvents.saveBookingEvent(input, tx);
  }

  deleteBookingEvents(
    eventIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.bookingEvents.deleteBookingEvents(eventIds, tx);
  }

  moveOccurrence(
    locationId: string,
    eventId: string,
    dto: MoveCalendarEventDto,
  ): Promise<CalendarEvent> {
    return this.events.moveOccurrence(locationId, eventId, dto);
  }

  getCalendar(
    locationId: string,
    dto: GetCalendarRequestDto,
    feed: CalendarBookingFeed,
  ): Promise<GetCalendarResponseDto> {
    return this.viewBuilder.getCalendar(locationId, dto, feed);
  }

  getAvailableSlots(
    locationId: string,
    dto: AvailableSlotsRequestDto,
  ): Promise<AvailableSlotsDayDto[]> {
    return this.availability.getAvailableSlots(locationId, dto);
  }

  getManualAvailableSlots(
    locationId: string,
    dto: ManualAvailableSlotsRequestDto,
    excludedCalendarEventIds: string[] = [],
  ): Promise<AvailableSlotsDayDto[]> {
    return this.availability.getManualAvailableSlots(
      locationId,
      dto,
      excludedCalendarEventIds,
    );
  }

  filterAvailableStaff(
    locationId: string,
    candidates: { id: string }[],
    dateStr: string,
    startAt: Date,
    endAt: Date,
    timezone: string,
  ): Promise<{ id: string }[]> {
    return this.availability.filterAvailableStaff(
      locationId,
      candidates,
      dateStr,
      startAt,
      endAt,
      timezone,
    );
  }

  isSlotFree(
    staffId: string,
    dateStr: string,
    startAt: Date,
    endAt: Date,
    shift: { startTime: Date; endTime: Date } | null,
    blockEvents: CalendarEventWithCancellations[],
    timezone: string,
  ): boolean {
    return this.availability.isSlotFree(
      staffId,
      dateStr,
      startAt,
      endAt,
      shift,
      blockEvents,
      timezone,
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Booking } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { AvailableSlotsDayDto } from '../../calendar/dto/available-slots-day.dto.js';
import { CancelBookingDto } from '../dto/cancel-booking.dto.js';
import { ClientBookingSlotsRequestDto } from '../dto/client-booking-slots-request.dto.js';
import { RescheduleClientBookingDto } from '../dto/reschedule-client-booking.dto.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { assertClientCanManageBooking } from '../rules/booking-client.rules.js';
import { BookingEventsService } from './booking-events.service.js';
import { BookingLifecycleService } from './write/booking-lifecycle.service.js';
import { BookingRescheduleService } from './write/booking-reschedule.service.js';

@Injectable()
export class BookingClientService {
  private readonly logger = new Logger(BookingClientService.name);

  constructor(
    private readonly reschedule: BookingRescheduleService,
    private readonly lifecycle: BookingLifecycleService,
    private readonly calendar: CalendarFacade,
    private readonly events: BookingEventsService,
  ) {}

  async availableSlots(
    booking: BookingWithItems,
    dto: ClientBookingSlotsRequestDto,
  ): Promise<AvailableSlotsDayDto[]> {
    assertClientCanManageBooking(booking);
    return this.calendar.getRescheduleSlots(
      booking.locationId,
      booking.items,
      dto.from,
      dto.to,
    );
  }

  cancelByClient(
    booking: BookingWithItems,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    return this.lifecycle.cancelByClient(booking, dto);
  }

  async rescheduleByClient(
    booking: BookingWithItems,
    dto: RescheduleClientBookingDto,
  ): Promise<BookingWithItems> {
    const actor = {
      name: `${booking.clientFirstName} ${booking.clientLastName}`.trim(),
      role: AuditActorRole.CLIENT,
    };
    const updated = await this.reschedule.rescheduleByClient(
      booking,
      dto.startAt,
      actor,
    );
    if (updated.startAt.getTime() === booking.startAt.getTime()) return updated;
    await this.events.updated(booking, updated, actor);
    try {
      await this.events.notifyStatus(updated, 'RESCHEDULED');
    } catch (error) {
      this.logger.error(
        `Failed to notify client about rescheduled booking ${booking.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return updated;
  }
}

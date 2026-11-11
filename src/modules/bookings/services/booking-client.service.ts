import { Injectable, Logger } from '@nestjs/common';
import { Booking } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { AvailableSlotsDayDto } from '../../calendar/dto/available-slots-day.dto.js';
import { LocationService } from '../../location/services/location.service.js';
import { ReviewWithStaff } from '../../reviews/interfaces/review-with-staff.interface.js';
import { ReviewsFacade } from '../../reviews/reviews.facade.js';
import { SubmitReviewDto } from '../../reviews/dto/submit-review.dto.js';
import { ClientBookingReviewContext } from '../interfaces/client-booking-review-context.interface.js';
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
    private readonly reviews: ReviewsFacade,
    private readonly locations: LocationService,
  ) {}

  async getReviewContext(
    booking: BookingWithItems,
  ): Promise<ClientBookingReviewContext> {
    const settings = await this.locations.getBookingSettings(
      booking.locationId,
    );
    const state = await this.reviews.getBookingReviewState(
      booking,
      settings.reviewsEnabled,
    );
    const links = {
      google: settings.googleReviewUrl,
      yandex: settings.yandexReviewUrl,
    };
    return {
      ...state,
      // Sent with the form so the thank-you step needs no extra request; the UI shows them after the review.
      reviewLinks:
        (state.canReview || state.review) && (links.google || links.yandex)
          ? links
          : null,
    };
  }

  async submitReview(
    booking: BookingWithItems,
    dto: SubmitReviewDto,
  ): Promise<ReviewWithStaff> {
    const settings = await this.locations.getBookingSettings(
      booking.locationId,
    );
    const { review } = await this.reviews.submitForBooking(
      booking,
      dto,
      settings.reviewsEnabled,
    );
    return review;
  }

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

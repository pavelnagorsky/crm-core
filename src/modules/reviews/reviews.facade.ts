import { Injectable } from '@nestjs/common';
import { BookingReviewState } from './interfaces/booking-review-state.interface.js';
import { ReviewLocationOverview } from './interfaces/review-location-overview.interface.js';
import { ReviewStaffSummary } from './interfaces/review-staff-summary.interface.js';
import { ReviewableBooking } from './interfaces/reviewable-booking.interface.js';
import { SubmitReviewInput } from './interfaces/submit-review-input.interface.js';
import { SubmitReviewResult } from './interfaces/submit-review-result.interface.js';
import { ReviewAggregatesService } from './services/review-aggregates.service.js';
import { isBookingReviewable } from './rules/review-eligibility.rules.js';
import { ReviewsService } from './services/reviews.service.js';

/** Public API of the reviews domain for other modules. */
@Injectable()
export class ReviewsFacade {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly aggregates: ReviewAggregatesService,
  ) {}

  submitForBooking(
    booking: ReviewableBooking,
    input: SubmitReviewInput,
    reviewsEnabled: boolean,
  ): Promise<SubmitReviewResult> {
    return this.reviews.submitForBooking(booking, input, reviewsEnabled);
  }

  async getBookingReviewState(
    booking: ReviewableBooking,
    reviewsEnabled: boolean,
  ): Promise<BookingReviewState> {
    return {
      canReview: isBookingReviewable(booking, reviewsEnabled),
      review: await this.reviews.findByBookingId(booking.id),
    };
  }

  /** Ids among `bookingIds` that already have a review. */
  findReviewedBookingIds(bookingIds: readonly string[]): Promise<Set<string>> {
    return this.reviews.findReviewedBookingIds(bookingIds);
  }

  getLocationOverview(locationId: string): Promise<ReviewLocationOverview> {
    return this.aggregates.getLocationOverview(locationId);
  }

  getStaffSummaries(
    locationId: string,
    staffIds: readonly string[],
  ): Promise<Map<string, ReviewStaffSummary>> {
    return this.aggregates.getStaffSummaries(locationId, staffIds);
  }
}

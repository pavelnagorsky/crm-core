import { Injectable } from '@nestjs/common';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { ImportedReview } from './interfaces/imported-review.interface.js';
import { BookingReviewState } from './interfaces/booking-review-state.interface.js';
import { ReviewImportCompletion } from './interfaces/review-import-completion.interface.js';
import { ReviewLocationOverview } from './interfaces/review-location-overview.interface.js';
import { ReviewStaffSummary } from './interfaces/review-staff-summary.interface.js';
import { ReviewWithStaff } from './interfaces/review-with-staff.interface.js';
import { ReviewableBooking } from './interfaces/reviewable-booking.interface.js';
import { SubmitReviewInput } from './interfaces/submit-review-input.interface.js';
import { SubmitReviewResult } from './interfaces/submit-review-result.interface.js';
import { ReviewAggregatesService } from './services/review-aggregates.service.js';
import { ReviewImportStoreService } from './services/review-import-store.service.js';
import { isBookingReviewable } from './rules/review-eligibility.rules.js';
import { ReviewsService } from './services/reviews.service.js';

/** Public API of the reviews domain for other modules. */
@Injectable()
export class ReviewsFacade {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly aggregates: ReviewAggregatesService,
    private readonly importStore: ReviewImportStoreService,
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

  /** The review of a visit for the staff panel, hidden ones included. */
  findForBooking(bookingId: string): Promise<ReviewWithStaff | null> {
    return this.reviews.findByBookingId(bookingId);
  }

  /** Ids among `bookingIds` that already have a review. */
  findReviewedBookingIds(bookingIds: readonly string[]): Promise<Set<string>> {
    return this.reviews.findReviewedBookingIds(bookingIds);
  }

  getLocationOverview(locationId: string): Promise<ReviewLocationOverview> {
    return this.aggregates.getLocationOverview(locationId);
  }

  /** Inserts one batch of imported reviews; returns how many were new. */
  insertImportedBatch(
    locationId: string,
    batchId: string,
    reviews: readonly ImportedReview[],
  ): Promise<number> {
    return this.importStore.insertBatch(locationId, batchId, reviews);
  }

  completeImport(
    locationId: string,
    completion: ReviewImportCompletion,
    actor: AuditActor,
  ): Promise<void> {
    return this.importStore.complete(locationId, completion, actor);
  }

  getStaffSummaries(
    locationId: string,
    staffIds: readonly string[],
  ): Promise<Map<string, ReviewStaffSummary>> {
    return this.aggregates.getStaffSummaries(locationId, staffIds);
  }
}

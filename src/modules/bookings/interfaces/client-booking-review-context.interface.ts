import { BookingReviewState } from '../../reviews/interfaces/booking-review-state.interface.js';

export interface ClientBookingReviewContext extends BookingReviewState {
  reviewLinks: { google: string | null; yandex: string | null } | null;
}

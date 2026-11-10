import { ReviewWithStaff } from './review-with-staff.interface.js';

export interface BookingReviewState {
  canReview: boolean;
  review: ReviewWithStaff | null;
}

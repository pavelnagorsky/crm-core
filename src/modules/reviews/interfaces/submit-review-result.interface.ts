import { ReviewWithStaff } from './review-with-staff.interface.js';

export interface SubmitReviewResult {
  review: ReviewWithStaff;
  created: boolean;
}

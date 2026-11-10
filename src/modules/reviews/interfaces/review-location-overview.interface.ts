import { ReviewSummary } from './review-summary.interface.js';
import { ReviewWithStaff } from './review-with-staff.interface.js';

export interface ReviewLocationOverview {
  summary: ReviewSummary;
  latest: ReviewWithStaff[];
}

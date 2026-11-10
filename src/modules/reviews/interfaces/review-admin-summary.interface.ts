import { ReviewSummary } from './review-summary.interface.js';

export interface ReviewAdminSummary {
  /** Published reviews only, the same figures clients see. */
  summary: ReviewSummary;
  hiddenCount: number;
  unansweredCount: number;
}

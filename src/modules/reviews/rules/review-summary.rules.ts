import { REVIEWS_MIN_FOR_AVERAGE } from '../constants/reviews.constants.js';
import { ReviewRatingGroup } from '../interfaces/review-rating-group.interface.js';
import { ReviewStaffSummary } from '../interfaces/review-staff-summary.interface.js';
import { ReviewSummary } from '../interfaces/review-summary.interface.js';

export function buildReviewStaffSummary(
  groups: readonly ReviewRatingGroup[],
): ReviewStaffSummary {
  let count = 0;
  let sum = 0;
  for (const group of groups) {
    count += group.count;
    sum += group.rating * group.count;
  }
  return {
    count,
    average:
      count >= REVIEWS_MIN_FOR_AVERAGE
        ? Math.round((sum / count) * 10) / 10
        : null,
  };
}

export function buildReviewSummary(
  groups: readonly ReviewRatingGroup[],
): ReviewSummary {
  const distribution: ReviewSummary['distribution'] = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  for (const group of groups) {
    if (group.rating in distribution)
      distribution[group.rating as keyof typeof distribution] += group.count;
  }
  return {
    ...buildReviewStaffSummary(groups),
    distribution,
  };
}

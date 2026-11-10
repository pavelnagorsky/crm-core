import { REVIEW_REPLY_MAX_LENGTH } from '../constants/reviews.constants.js';
import { ReviewText } from '../decorators/review-text.decorator.js';

export class SaveReviewReplyDto {
  @ReviewText(
    REVIEW_REPLY_MAX_LENGTH,
    'Plain text reply shown under the review; HTML tags are stripped, the result must not be empty',
  )
  text: string;
}

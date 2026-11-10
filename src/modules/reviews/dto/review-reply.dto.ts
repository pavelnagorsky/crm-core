import { ApiProperty } from '@nestjs/swagger';
import { ReviewWithStaff } from '../interfaces/review-with-staff.interface.js';

export class ReviewReplyDto {
  @ApiProperty()
  text: string;

  @ApiProperty()
  repliedAt: Date;

  /** Null when the review has no reply. */
  static fromReview(
    review: Pick<ReviewWithStaff, 'replyText' | 'repliedAt'>,
  ): ReviewReplyDto | null {
    return review.replyText && review.repliedAt
      ? Object.assign(new ReviewReplyDto(), {
          text: review.replyText,
          repliedAt: review.repliedAt,
        })
      : null;
  }
}

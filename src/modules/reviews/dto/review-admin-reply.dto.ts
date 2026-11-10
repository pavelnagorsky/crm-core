import { ApiProperty } from '@nestjs/swagger';
import { ReviewWithStaff } from '../interfaces/review-with-staff.interface.js';

export class ReviewAdminReplyDto {
  @ApiProperty()
  text: string;

  @ApiProperty()
  repliedAt: Date;

  @ApiProperty({ type: String, nullable: true })
  repliedByName: string | null;

  /** Null when the review has no reply. */
  static fromReview(
    review: Pick<ReviewWithStaff, 'replyText' | 'repliedAt' | 'repliedByName'>,
  ): ReviewAdminReplyDto | null {
    return review.replyText && review.repliedAt
      ? Object.assign(new ReviewAdminReplyDto(), {
          text: review.replyText,
          repliedAt: review.repliedAt,
          repliedByName: review.repliedByName,
        })
      : null;
  }
}

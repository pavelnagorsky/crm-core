import { ApiProperty } from '@nestjs/swagger';
import { ReviewStatus } from '@prisma/client';
import { ReviewWithStaff } from '../interfaces/review-with-staff.interface.js';
import { ReviewReplyDto } from './review-reply.dto.js';

/** The author's own view of the review; hiding by a manager is not disclosed. */
export class ClientReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  rating: number;

  @ApiProperty()
  text: string;

  @ApiProperty()
  reviewedAt: Date;

  @ApiProperty({ type: () => ReviewReplyDto, nullable: true })
  reply: ReviewReplyDto | null;

  static fromEntity(review: ReviewWithStaff): ClientReviewDto {
    return Object.assign(new ClientReviewDto(), {
      rating: review.rating,
      text: review.text,
      reviewedAt: review.reviewedAt,
      reply:
        review.status === ReviewStatus.PUBLISHED
          ? ReviewReplyDto.fromReview(review)
          : null,
    });
  }
}

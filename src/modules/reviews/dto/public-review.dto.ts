import { ApiProperty } from '@nestjs/swagger';
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
} from '../constants/reviews.constants.js';
import { ReviewWithStaff } from '../interfaces/review-with-staff.interface.js';
import { maskAuthorName } from '../rules/review-author.rules.js';
import { PublicReviewStaffDto } from './public-review-staff.dto.js';
import { ReviewReplyDto } from './review-reply.dto.js';

export class PublicReviewDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'First name and last-name initial, e.g. "Анна К."',
  })
  authorName: string | null;

  @ApiProperty({ minimum: REVIEW_RATING_MIN, maximum: REVIEW_RATING_MAX })
  rating: number;

  @ApiProperty()
  text: string;

  @ApiProperty()
  reviewedAt: Date;

  @ApiProperty({ type: () => ReviewReplyDto, nullable: true })
  reply: ReviewReplyDto | null;

  @ApiProperty({ type: () => PublicReviewStaffDto, isArray: true })
  staff: PublicReviewStaffDto[];

  static fromEntity(review: ReviewWithStaff): PublicReviewDto {
    return Object.assign(new PublicReviewDto(), {
      id: review.id,
      authorName: maskAuthorName(review),
      rating: review.rating,
      text: review.text,
      reviewedAt: review.reviewedAt,
      reply: ReviewReplyDto.fromReview(review),
      staff: [...review.staff]
        .sort((a, b) => a.staffName.localeCompare(b.staffName))
        .map(PublicReviewStaffDto.fromEntity),
    });
  }
}

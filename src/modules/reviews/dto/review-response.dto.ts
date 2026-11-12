import { ApiProperty } from '@nestjs/swagger';
import { ReviewStatus } from '@prisma/client';
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
} from '../constants/reviews.constants.js';
import { ReviewWithStaff } from '../interfaces/review-with-staff.interface.js';
import { ReviewWithVisit } from '../interfaces/review-with-visit.interface.js';
import { PublicReviewStaffDto } from './public-review-staff.dto.js';
import { ReviewAdminReplyDto } from './review-admin-reply.dto.js';
import { ReviewVisitDto } from './review-visit.dto.js';

/** Full review for the staff panel: unmasked author snapshot and moderation state. */
export class ReviewResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  locationId: string;

  @ApiProperty({ type: String, nullable: true })
  bookingId: string | null;

  @ApiProperty({ type: String, nullable: true })
  clientId: string | null;

  @ApiProperty({ type: String, nullable: true })
  authorFirstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  authorLastName: string | null;

  @ApiProperty({ minimum: REVIEW_RATING_MIN, maximum: REVIEW_RATING_MAX })
  rating: number;

  @ApiProperty()
  text: string;

  @ApiProperty()
  reviewedAt: Date;

  @ApiProperty({ enum: ReviewStatus })
  status: ReviewStatus;

  @ApiProperty({ type: Date, nullable: true })
  hiddenAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  hiddenReason: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Where an imported review came from; staff-only',
  })
  source: string | null;

  @ApiProperty({ type: () => ReviewAdminReplyDto, nullable: true })
  reply: ReviewAdminReplyDto | null;

  @ApiProperty({ type: () => PublicReviewStaffDto, isArray: true })
  staff: PublicReviewStaffDto[];

  @ApiProperty({
    type: () => ReviewVisitDto,
    nullable: true,
    description:
      'The reviewed visit. Null for imported reviews, deleted bookings and inside the booking card',
  })
  visit: ReviewVisitDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(
    review: ReviewWithStaff | ReviewWithVisit,
  ): ReviewResponseDto {
    const visit = 'visit' in review ? review.visit : null;
    return Object.assign(new ReviewResponseDto(), {
      id: review.id,
      locationId: review.locationId,
      bookingId: review.bookingId,
      clientId: review.clientId,
      authorFirstName: review.authorFirstName,
      authorLastName: review.authorLastName,
      rating: review.rating,
      text: review.text,
      reviewedAt: review.reviewedAt,
      status: review.status,
      hiddenAt: review.hiddenAt,
      hiddenReason: review.hiddenReason,
      source: review.source,
      reply: ReviewAdminReplyDto.fromReview(review),
      staff: [...review.staff]
        .sort((a, b) => a.staffName.localeCompare(b.staffName))
        .map(PublicReviewStaffDto.fromEntity),
      visit: visit ? ReviewVisitDto.fromEntity(visit) : null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    });
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { ReviewStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { REVIEW_HIDE_REASON_MAX_LENGTH } from '../constants/reviews.constants.js';
import { sanitizeReviewText } from '../rules/review-text.rules.js';

export class UpdateReviewVisibilityDto {
  @ApiProperty({ enum: ReviewStatus })
  @IsEnum(ReviewStatus)
  status: ReviewStatus;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: REVIEW_HIDE_REASON_MAX_LENGTH,
    description:
      'Internal note, never shown to the client. Required when hiding; ignored when publishing',
  })
  @IsOptional()
  @Transform(({ value }) => sanitizeReviewText(value))
  @IsString()
  @MaxLength(REVIEW_HIDE_REASON_MAX_LENGTH)
  reason?: string;
}

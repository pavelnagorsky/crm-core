import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
  REVIEW_TEXT_MAX_LENGTH,
} from '../constants/reviews.constants.js';
import { ReviewText } from '../decorators/review-text.decorator.js';

export class SubmitReviewDto {
  @ApiProperty({ minimum: REVIEW_RATING_MIN, maximum: REVIEW_RATING_MAX })
  @Type(() => Number)
  @IsInt()
  @Min(REVIEW_RATING_MIN)
  @Max(REVIEW_RATING_MAX)
  rating: number;

  @ReviewText(
    REVIEW_TEXT_MAX_LENGTH,
    'Plain text; HTML tags are stripped, the result must not be empty',
  )
  text: string;
}

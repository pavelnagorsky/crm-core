import { ApiProperty } from '@nestjs/swagger';
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
} from '../constants/reviews.constants.js';

export class ReviewRatingBucketDto {
  @ApiProperty({ minimum: REVIEW_RATING_MIN, maximum: REVIEW_RATING_MAX })
  rating: number;

  @ApiProperty()
  count: number;
}

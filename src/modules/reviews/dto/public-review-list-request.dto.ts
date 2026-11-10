import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import {
  PUBLIC_REVIEWS_DEFAULT_PAGE_SIZE,
  PUBLIC_REVIEWS_MAX_PAGE_SIZE,
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
} from '../constants/reviews.constants.js';

/** `orderBy` and `isExport` are ignored: the public list is always newest-first and paginated. */
export class PublicReviewListRequestDto extends PaginationRequestDto {
  @ApiProperty({
    type: Number,
    default: PUBLIC_REVIEWS_DEFAULT_PAGE_SIZE,
    maximum: PUBLIC_REVIEWS_MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PUBLIC_REVIEWS_MAX_PAGE_SIZE)
  override pageSize: number = PUBLIC_REVIEWS_DEFAULT_PAGE_SIZE;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Only reviews of visits served by this staff member',
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({
    type: Number,
    required: false,
    minimum: REVIEW_RATING_MIN,
    maximum: REVIEW_RATING_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(REVIEW_RATING_MIN)
  @Max(REVIEW_RATING_MAX)
  rating?: number;
}

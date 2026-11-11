import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewStatus } from '@prisma/client';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ParseBoolean } from '../../../shared/transforms/parse-boolean.transform.js';
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
} from '../constants/reviews.constants.js';
import { ReviewSearchOrderBy } from '../enums/review-search-order-by.enum.js';

export class ReviewSearchRequestDto extends PaginationRequestDto<ReviewSearchOrderBy> {
  @ApiProperty({
    type: String,
    required: false,
    description: 'Author name, review text or reply text',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Reviews left by this client, for the client card',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'true: only reviews with a reply; false: only reviews still waiting for one',
  })
  @IsOptional()
  @IsBoolean()
  @ParseBoolean()
  replied?: boolean;

  @ApiProperty({ enum: ReviewStatus, required: false })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

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

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    description: 'Reviews left at or after this moment',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    description: 'Reviews left at or before this moment',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ enum: ReviewSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(ReviewSearchOrderBy)
  declare orderBy?: ReviewSearchOrderBy;
}

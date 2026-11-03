import { ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { FeedbackOrderBy } from '../enums/feedback-order-by.enum.js';

export class FeedbackSearchRequestDto extends PaginationRequestDto<FeedbackOrderBy> {
  @ApiPropertyOptional({ maxLength: 255 })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: FeedbackStatus, enumName: 'FeedbackStatus' })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({ enum: FeedbackOrderBy, enumName: 'FeedbackOrderBy' })
  @IsOptional()
  @IsEnum(FeedbackOrderBy)
  declare orderBy?: FeedbackOrderBy;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupportRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { SupportRequestOrderBy } from '../enums/support-request-order-by.enum.js';

export class SupportRequestSearchRequestDto extends PaginationRequestDto<SupportRequestOrderBy> {
  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Matches email, message and notes',
  })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    enum: SupportRequestStatus,
    enumName: 'SupportRequestStatus',
  })
  @IsOptional()
  @IsEnum(SupportRequestStatus)
  status?: SupportRequestStatus;

  @ApiPropertyOptional({
    enum: SupportRequestOrderBy,
    enumName: 'SupportRequestOrderBy',
  })
  @IsOptional()
  @IsEnum(SupportRequestOrderBy)
  declare orderBy?: SupportRequestOrderBy;
}

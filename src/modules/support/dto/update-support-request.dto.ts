import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupportRequestStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class UpdateSupportRequestDto {
  @ApiPropertyOptional({
    enum: SupportRequestStatus,
    enumName: 'SupportRequestStatus',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(SupportRequestStatus)
  status?: SupportRequestStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 10000,
    description: 'Internal admin notes; null clears the notes',
  })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string | null;
}

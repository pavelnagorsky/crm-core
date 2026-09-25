import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class CancelBookingDto {
  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason?: string;
}

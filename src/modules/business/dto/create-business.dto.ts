import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { IsIanaTimezone } from '../../time/decorators/is-iana-timezone.validator.js';

export class CreateBusinessDto {
  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  logoFileId?: string;

  @ApiProperty({ type: Number, default: 15, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  advanceBookingWindowDays?: number;

  @ApiProperty({ type: Number, default: 30, required: false })
  @IsOptional()
  @IsInt()
  @Min(5)
  slotIntervalMinutes?: number;

  @ApiProperty({ type: Number, default: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumBookingNoticeMinutes?: number;

  @ApiProperty({ type: String, default: 'UTC', required: false, example: 'Europe/Minsk' })
  @IsOptional()
  @IsString()
  @IsIanaTimezone()
  timezone?: string;
}

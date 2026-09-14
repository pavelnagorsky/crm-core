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

export class UpdateBusinessDto {
  @ApiProperty({ type: String, maxLength: 255, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  logoFileId?: string | null;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  advanceBookingWindowDays?: number;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(5)
  slotIntervalMinutes?: number;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumBookingNoticeMinutes?: number;

  @ApiProperty({ type: String, required: false, example: 'Europe/Minsk' })
  @IsOptional()
  @IsString()
  @IsIanaTimezone()
  timezone?: string;
}

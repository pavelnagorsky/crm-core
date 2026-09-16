import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BookingSource } from '../enums/booking-source.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

export class CreateBookingDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  staffId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  startAt: string;

  @ApiProperty({ enum: BookingSource })
  @IsEnum(BookingSource)
  source: BookingSource;

  @ApiProperty({ enum: BookingStatus, default: BookingStatus.CONFIRMED, required: false })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

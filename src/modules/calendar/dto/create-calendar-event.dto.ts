import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CalendarEventType, CalendarEventRepeatType } from '@prisma/client';

export class CreateCalendarEventDto {
  @ApiProperty({ enum: CalendarEventType, default: CalendarEventType.BLOCK })
  @IsEnum(CalendarEventType)
  type: CalendarEventType;

  @ApiProperty({ type: String, maxLength: 100, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reason?: string;

  @ApiProperty({ type: String, maxLength: 255, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ type: String, description: 'ISO 8601 datetime', example: '2026-10-01T09:00:00' })
  @IsISO8601()
  startDateTime: string;

  @ApiProperty({ type: String, description: 'ISO 8601 datetime', example: '2026-10-01T18:00:00' })
  @IsISO8601()
  endDateTime: string;

  @ApiProperty({ enum: CalendarEventRepeatType, default: CalendarEventRepeatType.NONE })
  @IsEnum(CalendarEventRepeatType)
  repeatType: CalendarEventRepeatType;

  @ApiProperty({ type: String, maxLength: 7, required: false, nullable: true, description: '7-char bitmask for days of week, e.g. 1111100' })
  @IsOptional()
  @ValidateIf((o) => o.repeatType !== CalendarEventRepeatType.NONE)
  @IsString()
  @MaxLength(7)
  daysMask?: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Repeat until date YYYY-MM-DD. Omit for indefinite repetition.' })
  @IsOptional()
  @IsDateString()
  repeatUntil?: string;

  @ApiProperty({ type: [String], required: false, nullable: true, description: 'Staff member UUIDs. If empty/omitted, event is business-wide.' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  staffIds?: string[];
}

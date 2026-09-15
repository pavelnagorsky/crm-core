import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CalendarEventType, CalendarEventRepeatType } from '@prisma/client';

export class UpdateCalendarEventDto {
  @ApiProperty({ type: Boolean, description: 'true updates only this occurrence; false updates the entire event' })
  @IsBoolean()
  @Type(() => Boolean)
  thisOnly: boolean;

  @ApiProperty({ enum: CalendarEventType })
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

  @ApiProperty({ enum: CalendarEventRepeatType })
  @IsEnum(CalendarEventRepeatType)
  repeatType: CalendarEventRepeatType;

  @ApiProperty({ type: String, maxLength: 7, required: false, nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.repeatType !== CalendarEventRepeatType.NONE)
  @IsString()
  @MaxLength(7)
  daysMask?: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Repeat until date YYYY-MM-DD. Omit for indefinite repetition.' })
  @IsOptional()
  @IsDateString()
  repeatUntil?: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Staff member UUID, or null for business-wide' })
  @IsOptional()
  @IsUUID()
  staffId?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Required when thisOnly is true — the specific occurrence date YYYY-MM-DD' })
  @ValidateIf((o) => o.thisOnly === true)
  @IsDateString()
  occurrenceDate?: string;
}

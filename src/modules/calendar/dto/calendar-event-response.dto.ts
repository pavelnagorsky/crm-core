import { ApiProperty } from '@nestjs/swagger';
import { CalendarEventType, CalendarEventRepeatType, CalendarEvent } from '@prisma/client';

export class CalendarEventResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String, nullable: true })
  staffId: string | null;

  @ApiProperty({ enum: CalendarEventType })
  type: CalendarEventType;

  @ApiProperty({ type: String, nullable: true })
  reason: string | null;

  @ApiProperty({ type: String, nullable: true })
  title: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ enum: CalendarEventRepeatType })
  repeatType: CalendarEventRepeatType;

  @ApiProperty({ type: String })
  startDateTime: string;

  @ApiProperty({ type: String })
  endDateTime: string;

  @ApiProperty({ type: String, nullable: true })
  daysMask: string | null;

  @ApiProperty({ type: String, nullable: true })
  repeatUntil: string | null;

  static fromEntity(event: CalendarEvent): CalendarEventResponseDto {
    const dto = new CalendarEventResponseDto();
    dto.id = event.id;
    dto.businessId = event.businessId;
    dto.staffId = event.staffId;
    dto.type = event.type;
    dto.reason = event.reason;
    dto.title = event.title;
    dto.notes = event.notes;
    dto.repeatType = event.repeatType;
    dto.startDateTime = event.startDateTime.toISOString();
    dto.endDateTime = event.endDateTime.toISOString();
    dto.daysMask = event.daysMask;
    dto.repeatUntil = event.repeatUntil ? event.repeatUntil.toISOString().slice(0, 10) : null;
    return dto;
  }
}

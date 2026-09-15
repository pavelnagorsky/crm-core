import { ApiProperty } from '@nestjs/swagger';
import { CalendarEvent, CalendarEventType, CalendarEventRepeatType } from '@prisma/client';

export class CalendarEventItemDto {
  @ApiProperty({ type: String })
  id: string;

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

  @ApiProperty({ type: String, description: 'YYYY-MM-DD' })
  date: string;

  @ApiProperty({ type: String, description: 'HH:mm in business timezone' })
  startTime: string;

  @ApiProperty({ type: String, description: 'HH:mm in business timezone' })
  endTime: string;

  static fromEntity(
    event: CalendarEvent,
    date: string,
    startTime: string,
    endTime: string,
  ): CalendarEventItemDto {
    const dto = new CalendarEventItemDto();
    dto.id = event.id;
    dto.staffId = event.staffId;
    dto.type = event.type;
    dto.reason = event.reason;
    dto.title = event.title;
    dto.notes = event.notes;
    dto.repeatType = event.repeatType;
    dto.date = date;
    dto.startTime = startTime;
    dto.endTime = endTime;
    return dto;
  }
}

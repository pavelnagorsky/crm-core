import { ApiProperty } from '@nestjs/swagger';
import { CalendarEventType, CalendarEventRepeatType } from '@prisma/client';

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
}

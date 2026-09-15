import { ApiProperty } from '@nestjs/swagger';
import { CalendarEventItemDto } from './calendar-event-item.dto.js';
import { ClosedTimeItemDto } from './closed-time-item.dto.js';

class CalendarRangeDto {
  @ApiProperty({ type: String, description: 'YYYY-MM-DD' })
  from: string;

  @ApiProperty({ type: String, description: 'YYYY-MM-DD' })
  to: string;
}

class CalendarViewDto {
  @ApiProperty({ type: String, description: 'Earliest shift start across the range, HH:mm' })
  minTime: string;

  @ApiProperty({ type: String, description: 'Latest shift end across the range, HH:mm' })
  maxTime: string;
}

export class GetCalendarResponseDto {
  @ApiProperty({ type: () => CalendarRangeDto })
  range: CalendarRangeDto;

  @ApiProperty({ type: String, description: 'IANA timezone of the business' })
  timezone: string;

  @ApiProperty({ type: () => CalendarViewDto })
  view: CalendarViewDto;

  @ApiProperty({ type: () => ClosedTimeItemDto, isArray: true })
  closedTime: ClosedTimeItemDto[];

  @ApiProperty({ type: () => CalendarEventItemDto, isArray: true })
  events: CalendarEventItemDto[];
}

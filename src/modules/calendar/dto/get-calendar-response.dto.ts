import { ApiProperty } from '@nestjs/swagger';
import { CalendarEventItemDto } from './calendar-event-item.dto.js';
import { CalendarRangeDto } from './calendar-range.dto.js';
import { CalendarViewDto } from './calendar-view.dto.js';
import { ClosedTimeItemDto } from './closed-time-item.dto.js';

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

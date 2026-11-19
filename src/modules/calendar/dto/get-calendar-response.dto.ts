import { ApiProperty } from '@nestjs/swagger';
import { CalendarEventItemDto } from './calendar-event-item.dto.js';
import { CalendarRangeDto } from './calendar-range.dto.js';
import { CalendarViewDto } from './calendar-view.dto.js';
import { ClosedTimeItemDto } from './closed-time-item.dto.js';
import { StaffClosedTimeItemDto } from './staff-closed-time-item.dto.js';

export class GetCalendarResponseDto {
  @ApiProperty({ type: () => CalendarRangeDto })
  range: CalendarRangeDto;

  @ApiProperty({ type: String, description: 'IANA timezone of the business' })
  timezone: string;

  @ApiProperty({ type: () => CalendarViewDto })
  view: CalendarViewDto;

  @ApiProperty({
    type: () => ClosedTimeItemDto,
    isArray: true,
    description: 'Time inside the view bounds when no staff member works',
  })
  closedTime: ClosedTimeItemDto[];

  @ApiProperty({
    type: () => StaffClosedTimeItemDto,
    isArray: true,
    description:
      'Per active staff member of the location (only the requested staffIds when given): time inside the view bounds outside their shift. A day without a shift is closed from minTime to maxTime',
  })
  staffClosedTime: StaffClosedTimeItemDto[];

  @ApiProperty({ type: () => CalendarEventItemDto, isArray: true })
  events: CalendarEventItemDto[];
}

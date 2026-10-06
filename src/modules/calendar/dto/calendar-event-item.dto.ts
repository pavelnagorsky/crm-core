import { ApiProperty } from '@nestjs/swagger';
import { CalendarEventRepeatType, CalendarEventType } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { TimeService } from '../../time/time.service.js';
import { CalendarBookingView } from '../interfaces/calendar-booking-view.interface.js';

const FALLBACK_TITLE = 'Событие';

export class CalendarEventItemDto {
  @ApiProperty({
    type: String,
    description:
      'Card key in this response. A block occurrence is {eventId}:{date}.',
  })
  id: string;

  @ApiProperty({ enum: CalendarEventType })
  type: CalendarEventType;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Id for GET by id. Null when that endpoint does not exist.',
  })
  entityId: string | null;

  @ApiProperty({ type: String, nullable: true })
  staffId: string | null;

  @ApiProperty({ type: String, nullable: true })
  staffName: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  subtitle: string | null;

  @ApiProperty({ type: String, nullable: true })
  caption: string | null;

  @ApiProperty({
    type: String,
    description: 'YYYY-MM-DD in the business timezone',
  })
  date: string;

  @ApiProperty({ type: String, description: 'HH:mm in the business timezone' })
  startTime: string;

  @ApiProperty({ type: String, description: 'HH:mm in the business timezone' })
  endTime: string;

  @ApiProperty({ type: Boolean })
  editable: boolean;

  @ApiProperty({ type: Boolean })
  repeating: boolean;

  static block(
    event: {
      id: string;
      staffId: string | null;
      title: string | null;
      reason: string | null;
      repeatType: CalendarEventRepeatType;
    },
    date: string,
    startTime: string,
    endTime: string,
    staffName: string | null,
  ): CalendarEventItemDto {
    const dto = new CalendarEventItemDto();
    dto.id = `${event.id}:${date}`;
    dto.type = CalendarEventType.BLOCK;
    dto.entityId = event.id;
    dto.staffId = event.staffId;
    dto.staffName = event.staffId ? staffName : null;
    dto.title = event.title?.trim() || event.reason?.trim() || FALLBACK_TITLE;
    dto.subtitle = null;
    dto.caption = null;
    dto.date = date;
    dto.startTime = startTime;
    dto.endTime = endTime;
    dto.editable = true;
    dto.repeating = event.repeatType === CalendarEventRepeatType.WEEKLY;
    return dto;
  }

  static booking(
    booking: CalendarBookingView,
    timezone: string,
    currency: string,
  ): CalendarEventItemDto {
    const name = `${booking.clientLastName} ${booking.clientFirstName}`.trim();
    const serviceTitle = booking.serviceTitle.trim();
    const title = serviceTitle || name || FALLBACK_TITLE;
    const start = TimeService.toZonedParts(booking.startAt, timezone);
    const end = TimeService.toZonedParts(booking.endAt, timezone);
    const dto = new CalendarEventItemDto();
    dto.id = booking.id;
    dto.type = CalendarEventType.BOOKING;
    dto.entityId = booking.id;
    dto.staffId = booking.staffId;
    dto.staffName = booking.staffName;
    dto.title = title;
    dto.subtitle = name && name !== title ? name : null;
    dto.caption = MoneyService.formatCurrency(
      booking.customPrice ?? booking.servicePrice,
      currency,
    );
    dto.date = TimeService.zonedDateStr(booking.startAt, timezone);
    dto.startTime = TimeService.minutesToHHmm(start.hour * 60 + start.minute);
    dto.endTime = TimeService.minutesToHHmm(end.hour * 60 + end.minute);
    dto.editable = false;
    dto.repeating = false;
    return dto;
  }
}

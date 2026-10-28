import { ApiProperty } from '@nestjs/swagger';
import {
  BookingStatus,
  CalendarEventRepeatType,
  CalendarEventType,
} from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { CalendarBookingView } from '../interfaces/calendar-booking-view.interface.js';

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
    enum: BookingStatus,
    nullable: true,
    description:
      'Booking status. Included for every calendar reader regardless of role. Null for blocks and integration events.',
  })
  status: BookingStatus | null;

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

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Booking client first and last name. Included for every calendar reader regardless of role. Null for blocks and integration events.',
  })
  clientName: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Explicit event name. Null when the card should fall back to the type label.',
  })
  title: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Booking service line: one title, two titles joined by " + ", or a count from three upward.',
  })
  subtitle: string | null;

  @ApiPrice({
    nullable: true,
    description:
      'Booking amount as a decimal string. Null when the event has no price.',
  })
  price: string | null;

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
    const dto = CalendarEventItemDto.placed(
      event,
      CalendarEventType.BLOCK,
      date,
      startTime,
      endTime,
      staffName,
    );
    dto.title = event.title?.trim() || event.reason?.trim() || null;
    return dto;
  }

  static integration(
    event: {
      id: string;
      staffId: string | null;
      title: string | null;
      repeatType: CalendarEventRepeatType;
    },
    date: string,
    startTime: string,
    endTime: string,
    staffName: string | null,
  ): CalendarEventItemDto {
    const dto = CalendarEventItemDto.placed(
      event,
      CalendarEventType.INTEGRATION,
      date,
      startTime,
      endTime,
      staffName,
    );
    dto.title = event.title?.trim() || null;
    return dto;
  }

  static booking(
    booking: CalendarBookingView,
    timezone: string,
  ): CalendarEventItemDto {
    const start = TimeUtils.toZonedParts(booking.startAt, timezone);
    const end = TimeUtils.toZonedParts(booking.endAt, timezone);
    const dto = new CalendarEventItemDto();
    dto.id = booking.id;
    dto.type = CalendarEventType.BOOKING;
    dto.status = booking.status;
    dto.entityId = booking.entityId;
    dto.staffId = booking.staffId;
    dto.staffName = booking.staffName;
    dto.clientName = booking.clientName;
    dto.title = null;
    dto.subtitle = serviceSubtitle(booking.serviceTitles);
    dto.price = booking.price;
    dto.date = TimeUtils.zonedDateStr(booking.startAt, timezone);
    dto.startTime = TimeUtils.minutesToHHmm(start.hour * 60 + start.minute);
    dto.endTime = TimeUtils.minutesToHHmm(end.hour * 60 + end.minute);
    dto.editable = false;
    dto.repeating = false;
    return dto;
  }

  private static placed(
    event: {
      id: string;
      staffId: string | null;
      repeatType: CalendarEventRepeatType;
    },
    type: CalendarEventType,
    date: string,
    startTime: string,
    endTime: string,
    staffName: string | null,
  ): CalendarEventItemDto {
    const dto = new CalendarEventItemDto();
    dto.id = `${event.id}:${date}`;
    dto.type = type;
    dto.status = null;
    dto.entityId = event.id;
    dto.staffId = event.staffId;
    dto.staffName = event.staffId ? staffName : null;
    dto.clientName = null;
    dto.title = null;
    dto.subtitle = null;
    dto.price = null;
    dto.date = date;
    dto.startTime = startTime;
    dto.endTime = endTime;
    dto.editable = true;
    dto.repeating = event.repeatType === CalendarEventRepeatType.WEEKLY;
    return dto;
  }
}

function serviceSubtitle(titles: string[]): string | null {
  const names = titles.map((title) => title.trim()).filter((title) => title);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names.length} ${serviceCountWord(names.length)}`;
}

function serviceCountWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'услуга';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'услуги';
  return 'услуг';
}

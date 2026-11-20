import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { BookingChannel } from '../enums/booking-channel.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingClientNoticeDto } from './booking-client-notice.dto.js';
import { BookingItemResponseDto } from './booking-item-response.dto.js';

export class BookingResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  locationId: string;

  @ApiProperty({ type: String, nullable: true })
  clientId: string | null;

  @ApiProperty({ type: Date })
  startAt: Date;

  @ApiProperty({ type: Date })
  endAt: Date;

  @ApiProperty({ enum: BookingExecutionMode })
  executionMode: BookingExecutionMode;

  @ApiProperty({ type: String, nullable: true })
  bundleId: string | null;

  @ApiProperty({ enum: BookingStatus })
  status: BookingStatus;

  @ApiProperty({
    enum: BookingChannel,
    enumName: 'BookingChannel',
    description:
      'Where the booking was made: public booking page, site widget or staff journal',
  })
  channel: BookingChannel;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Booking page of a PUBLIC_PAGE booking; null once deleted',
  })
  bookingPageId: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Widget of a WIDGET booking; null once deleted',
  })
  bookingWidgetId: string | null;

  @ApiProperty({
    enum: TrafficSource,
    enumName: 'TrafficSource',
    nullable: true,
    description:
      'Marketing source. Always set on online bookings (DIRECT when nothing is known) and read-only there; on a manual booking null means not specified',
  })
  trafficSource: TrafficSource | null;

  @ApiProperty({
    type: String,
    maxLength: 64,
    nullable: true,
    description:
      'Source detail ("Уточнение"): campaign, platform, site or engine, lowercase',
  })
  trafficSourceDetail: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'Whether this manual booking uses custom time.',
  })
  isCustomTime: boolean;

  @ApiProperty({ type: String })
  clientFirstName: string;

  @ApiProperty({ type: String })
  clientLastName: string;

  @ApiProperty({ type: String, nullable: true })
  clientPhone: string | null;

  @ApiProperty({ type: String, nullable: true })
  clientEmail: string | null;

  @ApiProperty({ type: () => BookingItemResponseDto, isArray: true })
  items: BookingItemResponseDto[];

  @ApiPrice()
  totalListPrice: string;

  @ApiPrice()
  totalChargedPrice: string;

  @ApiProperty({ type: Number })
  totalDuration: number;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ type: String, nullable: true })
  internalNotes: string | null;

  @ApiProperty({
    type: Boolean,
    description:
      'Staff email the client about this booking: the confirmation and later moves. Set at creation',
  })
  notifyClient: boolean;

  @ApiProperty({
    type: () => BookingClientNoticeDto,
    nullable: true,
    description: 'An email to the client still waiting to go out',
  })
  clientNotice: BookingClientNoticeDto | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(booking: BookingWithItems): BookingResponseDto {
    const dto = new BookingResponseDto();
    dto.id = booking.id;
    dto.locationId = booking.locationId;
    dto.clientId = booking.clientId;
    dto.startAt = booking.startAt;
    dto.endAt = booking.endAt;
    dto.executionMode = booking.executionMode as BookingExecutionMode;
    dto.bundleId = booking.bundleId;
    dto.status = booking.status as BookingStatus;
    dto.channel = booking.channel as BookingChannel;
    dto.bookingPageId = booking.bookingPageId;
    dto.bookingWidgetId = booking.bookingWidgetId;
    dto.trafficSource = booking.trafficSource as TrafficSource | null;
    dto.trafficSourceDetail = booking.trafficSourceDetail;
    dto.isCustomTime = booking.isCustomTime;
    dto.notifyClient = booking.notifyClient;
    dto.clientNotice = BookingClientNoticeDto.fromBooking(booking);
    dto.clientFirstName = booking.clientFirstName;
    dto.clientLastName = booking.clientLastName;
    dto.clientPhone = booking.clientPhone;
    dto.clientEmail = booking.clientEmail;
    dto.items = booking.items.map(BookingItemResponseDto.fromEntity);
    dto.totalListPrice = MoneyUtils.format(
      booking.items.reduce(
        (sum, item) => sum.plus(item.listPrice),
        new Prisma.Decimal(0),
      ),
    );
    dto.totalChargedPrice = MoneyUtils.format(
      booking.items.reduce(
        (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
        new Prisma.Decimal(0),
      ),
    );
    dto.totalDuration = Math.round(
      (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000,
    );
    dto.notes = booking.notes;
    dto.internalNotes = booking.internalNotes;
    dto.createdAt = booking.createdAt;
    dto.updatedAt = booking.updatedAt;
    return dto;
  }
}

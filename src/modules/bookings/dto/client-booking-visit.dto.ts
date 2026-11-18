import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { ClientBookingVisit } from '../interfaces/client-booking-visit.interface.js';
import { ClientBookingVisitItemDto } from './client-booking-visit-item.dto.js';

export class ClientBookingVisitDto {
  @ApiProperty({ type: String, format: 'uuid' })
  bookingId: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Location of the booking; may differ from the requested one',
  })
  locationId: string;

  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus' })
  status: BookingStatus;

  @ApiProperty({ type: Date, description: 'UTC instant' })
  startAt: Date;

  @ApiProperty({ type: Date, description: 'UTC instant' })
  endAt: Date;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  bundleId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Current bundle title; null without a bundle',
  })
  bundleTitle: string | null;

  @ApiPrice({
    description:
      'Sum of the charged service prices, custom prices included, in the currency of the booking location. Products are not included',
  })
  total: string;

  @ApiProperty({ type: () => ClientBookingVisitItemDto, isArray: true })
  items: ClientBookingVisitItemDto[];

  static fromVisit(visit: ClientBookingVisit): ClientBookingVisitDto {
    const { booking } = visit;
    return Object.assign(new ClientBookingVisitDto(), {
      bookingId: booking.id,
      locationId: booking.locationId,
      status: booking.status,
      startAt: booking.startAt,
      endAt: booking.endAt,
      bundleId: booking.bundleId,
      bundleTitle: visit.bundleTitle,
      total: MoneyUtils.format(
        booking.items.reduce(
          (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
          new Prisma.Decimal(0),
        ),
      ),
      items: booking.items.map(ClientBookingVisitItemDto.fromItem),
    });
  }
}

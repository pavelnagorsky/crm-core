import { ApiProperty, PickType } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import {
  canClientManageBooking,
  clientAccessExpiresAt,
} from '../rules/booking-client.rules.js';
import { BookingResponseDto } from './booking-response.dto.js';
import { ClientBookingItemResponseDto } from './client-booking-item-response.dto.js';

export class ClientBookingResponseDto extends PickType(BookingResponseDto, [
  'id',
  'locationId',
  'startAt',
  'endAt',
  'executionMode',
  'status',
  'clientFirstName',
  'clientLastName',
  'clientPhone',
  'clientEmail',
  'notes',
  'totalChargedPrice',
  'totalDuration',
] as const) {
  @ApiProperty({ type: () => ClientBookingItemResponseDto, isArray: true })
  items: ClientBookingItemResponseDto[];

  @ApiProperty({ type: Boolean })
  canCancel: boolean;

  @ApiProperty({ type: Boolean })
  canReschedule: boolean;

  @ApiProperty({ type: Date })
  accessExpiresAt: Date;

  @ApiProperty({ type: String, nullable: true })
  cancellationReason: string | null;

  static fromBooking(booking: BookingWithItems): ClientBookingResponseDto {
    const canManage = canClientManageBooking(booking);
    return Object.assign(new ClientBookingResponseDto(), {
      id: booking.id,
      locationId: booking.locationId,
      startAt: booking.startAt,
      endAt: booking.endAt,
      executionMode: booking.executionMode,
      status: booking.status,
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      clientPhone: booking.clientPhone,
      clientEmail: booking.clientEmail,
      notes: booking.notes,
      totalChargedPrice: MoneyUtils.format(
        booking.items.reduce(
          (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
          new Prisma.Decimal(0),
        ),
      ),
      totalDuration: Math.round(
        (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000,
      ),
      items: booking.items.map(ClientBookingItemResponseDto.fromBookingItem),
      canCancel: canManage,
      canReschedule: canManage,
      accessExpiresAt: clientAccessExpiresAt(booking),
      cancellationReason: booking.cancellationReason,
    });
  }
}

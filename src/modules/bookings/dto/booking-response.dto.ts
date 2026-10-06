import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingSource } from '../enums/booking-source.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingItemResponseDto } from './booking-item-response.dto.js';

export class BookingResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  locationId: string;

  @ApiProperty({ type: String })
  clientId: string;

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

  @ApiProperty({ enum: BookingSource })
  source: BookingSource;

  @ApiProperty({ type: String })
  clientFirstName: string;

  @ApiProperty({ type: String })
  clientLastName: string;

  @ApiProperty({ type: String })
  clientPhone: string;

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
    dto.source = booking.source as BookingSource;
    dto.clientFirstName = booking.clientFirstName;
    dto.clientLastName = booking.clientLastName;
    dto.clientPhone = booking.clientPhone;
    dto.clientEmail = booking.clientEmail;
    dto.items = booking.items.map(BookingItemResponseDto.fromEntity);
    dto.totalListPrice = MoneyService.format(
      booking.items.reduce(
        (sum, item) => sum.plus(item.listPrice),
        new Prisma.Decimal(0),
      ),
    );
    dto.totalChargedPrice = MoneyService.format(
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

  static fromEntityPublic(booking: BookingWithItems): BookingResponseDto {
    const dto = BookingResponseDto.fromEntity(booking);
    dto.internalNotes = null;
    return dto;
  }
}

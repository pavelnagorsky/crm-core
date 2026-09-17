import { ApiProperty } from '@nestjs/swagger';
import { Booking } from '@prisma/client';
import { BookingSource } from '../enums/booking-source.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

export class BookingResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  clientId: string;

  @ApiProperty({ type: Date })
  startAt: Date;

  @ApiProperty({ type: Date })
  endAt: Date;

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

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiProperty({ type: Number })
  serviceDuration: number;

  @ApiProperty({ type: Number })
  servicePrice: number;

  @ApiProperty({ type: Number, nullable: true })
  customPrice: number | null;

  @ApiProperty({ type: String })
  staffName: string;

  @ApiProperty({ type: String, nullable: true })
  calendarEventId: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ type: String, nullable: true })
  internalNotes: string | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(booking: Booking): BookingResponseDto {
    const dto = new BookingResponseDto();
    dto.id = booking.id;
    dto.businessId = booking.businessId;
    dto.staffId = booking.staffId;
    dto.serviceId = booking.serviceId;
    dto.clientId = booking.clientId;
    dto.startAt = booking.startAt;
    dto.endAt = booking.endAt;
    dto.status = booking.status as BookingStatus;
    dto.source = booking.source as BookingSource;
    dto.clientFirstName = booking.clientFirstName;
    dto.clientLastName = booking.clientLastName;
    dto.clientPhone = booking.clientPhone;
    dto.clientEmail = booking.clientEmail;
    dto.serviceTitle = booking.serviceTitle;
    dto.serviceDuration = booking.serviceDuration;
    dto.servicePrice = Number(booking.servicePrice);
    dto.customPrice = booking.customPrice !== null ? Number(booking.customPrice) : null;
    dto.staffName = booking.staffName;
    dto.calendarEventId = booking.calendarEventId;
    dto.notes = booking.notes;
    dto.internalNotes = booking.internalNotes;
    dto.createdAt = booking.createdAt;
    dto.updatedAt = booking.updatedAt;
    return dto;
  }

  static fromEntityPublic(booking: Booking): BookingResponseDto {
    const dto = BookingResponseDto.fromEntity(booking);
    dto.internalNotes = null; // staff-only field, not exposed to clients
    return dto;
  }
}

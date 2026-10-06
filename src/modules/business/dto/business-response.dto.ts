import { ApiProperty } from '@nestjs/swagger';
import { BookingVisibility } from '../enums/booking-visibility.enum.js';
import { BusinessWithLogo } from '../interfaces/business-with-logo.interface.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';

export class BusinessResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  logo: FileResponseDto | null;

  @ApiProperty({ type: Number })
  advanceBookingWindowDays: number;

  @ApiProperty({ type: Number })
  slotIntervalMinutes: number;

  @ApiProperty({ type: Number })
  minimumBookingNoticeMinutes: number;

  @ApiProperty({ type: String })
  timezone: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ enum: BookingVisibility })
  bookingVisibility: BookingVisibility;

  @ApiProperty({ type: Boolean })
  isBookingConfirmationRequired: boolean;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(business: BusinessWithLogo): BusinessResponseDto {
    const dto = new BusinessResponseDto();
    dto.id = business.id;
    dto.name = business.name;
    dto.logo = business.logoFile
      ? FileResponseDto.fromEntity(business.logoFile)
      : null;
    dto.advanceBookingWindowDays = business.advanceBookingWindowDays ?? 60;
    dto.slotIntervalMinutes = business.slotIntervalMinutes ?? 30;
    dto.minimumBookingNoticeMinutes = business.minimumBookingNoticeMinutes ?? 0;
    dto.timezone = business.timezone ?? 'UTC';
    dto.currency = business.currency ?? 'USD';
    dto.bookingVisibility = (business.bookingVisibility ??
      BookingVisibility.PUBLIC) as BookingVisibility;
    dto.isBookingConfirmationRequired =
      business.isBookingConfirmationRequired ?? false;
    dto.createdAt = business.createdAt;
    dto.updatedAt = business.updatedAt;
    return dto;
  }
}

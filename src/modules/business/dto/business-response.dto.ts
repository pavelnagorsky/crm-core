import { ApiProperty } from '@nestjs/swagger';
import { BookingVisibility } from '../enums/booking-visibility.enum.js';
import { BusinessWithLogo } from '../business.service.js';
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
    dto.logo = business.logoFile ? FileResponseDto.fromEntity(business.logoFile) : null;
    dto.advanceBookingWindowDays = business.advanceBookingWindowDays;
    dto.slotIntervalMinutes = business.slotIntervalMinutes;
    dto.minimumBookingNoticeMinutes = business.minimumBookingNoticeMinutes;
    dto.timezone = business.timezone;
    dto.currency = business.currency;
    dto.bookingVisibility = business.bookingVisibility as BookingVisibility;
    dto.isBookingConfirmationRequired = business.isBookingConfirmationRequired;
    dto.createdAt = business.createdAt;
    dto.updatedAt = business.updatedAt;
    return dto;
  }
}

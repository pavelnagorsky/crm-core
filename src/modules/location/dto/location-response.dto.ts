import { ApiProperty } from '@nestjs/swagger';
import { BookingVisibility, BusinessType, Location } from '@prisma/client';

export class LocationResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String })
  countryCode: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ type: String })
  timezone: string;

  @ApiProperty({ enum: BusinessType, nullable: true })
  businessType: BusinessType | null;

  @ApiProperty({ type: String, nullable: true })
  city: string | null;

  @ApiProperty({ type: String, nullable: true })
  addressLine: string | null;

  @ApiProperty({ type: Number })
  advanceBookingWindowDays: number;

  @ApiProperty({ type: Number })
  slotIntervalMinutes: number;

  @ApiProperty({ type: Number })
  minimumBookingNoticeMinutes: number;

  @ApiProperty({ enum: BookingVisibility })
  bookingVisibility: BookingVisibility;

  @ApiProperty({ type: Boolean })
  isBookingConfirmationRequired: boolean;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(location: Location): LocationResponseDto {
    const dto = new LocationResponseDto();
    dto.id = location.id;
    dto.brandId = location.brandId;
    dto.name = location.name;
    dto.countryCode = location.countryCode;
    dto.currency = location.currency;
    dto.timezone = location.timezone;
    dto.businessType = location.businessType;
    dto.city = location.city;
    dto.addressLine = location.addressLine;
    dto.advanceBookingWindowDays = location.advanceBookingWindowDays;
    dto.slotIntervalMinutes = location.slotIntervalMinutes;
    dto.minimumBookingNoticeMinutes = location.minimumBookingNoticeMinutes;
    dto.bookingVisibility = location.bookingVisibility;
    dto.isBookingConfirmationRequired = location.isBookingConfirmationRequired;
    dto.createdAt = location.createdAt;
    dto.updatedAt = location.updatedAt;
    return dto;
  }
}

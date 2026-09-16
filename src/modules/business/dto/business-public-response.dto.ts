import { ApiProperty } from '@nestjs/swagger';
import { Business } from '@prisma/client';
import { BookingVisibility } from '../enums/booking-visibility.enum.js';

export class BusinessPublicResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  logoFileId: string | null;

  @ApiProperty({ type: String })
  timezone: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ enum: BookingVisibility })
  bookingVisibility: BookingVisibility;

  static fromEntity(business: Business): BusinessPublicResponseDto {
    const dto = new BusinessPublicResponseDto();
    dto.id = business.id;
    dto.name = business.name;
    dto.logoFileId = business.logoFileId;
    dto.timezone = business.timezone;
    dto.currency = business.currency;
    dto.bookingVisibility = business.bookingVisibility as BookingVisibility;
    return dto;
  }
}

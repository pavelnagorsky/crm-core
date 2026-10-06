import { ApiProperty } from '@nestjs/swagger';
import { BookingVisibility } from '../enums/booking-visibility.enum.js';
import { BusinessWithLogo } from '../interfaces/business-with-logo.interface.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';

export class BusinessPublicResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  logo: FileResponseDto | null;

  @ApiProperty({ type: String })
  timezone: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ enum: BookingVisibility })
  bookingVisibility: BookingVisibility;

  static fromEntity(business: BusinessWithLogo): BusinessPublicResponseDto {
    const dto = new BusinessPublicResponseDto();
    dto.id = business.id;
    dto.name = business.name;
    dto.logo = business.logoFile
      ? FileResponseDto.fromEntity(business.logoFile)
      : null;
    dto.timezone = business.timezone ?? 'UTC';
    dto.currency = business.currency ?? 'USD';
    dto.bookingVisibility = (business.bookingVisibility ??
      BookingVisibility.PUBLIC) as BookingVisibility;
    return dto;
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { BookingVisibility } from '@prisma/client';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { LocationPublicProfile } from '../interfaces/location-public-profile.interface.js';

export class LocationPublicResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ type: String })
  brandName: string;

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

  static fromEntity(location: LocationPublicProfile): LocationPublicResponseDto {
    const dto = new LocationPublicResponseDto();
    dto.id = location.id;
    dto.brandId = location.brandId;
    dto.brandName = location.brand.name;
    dto.name = location.name;
    dto.logo = location.brand.logoFile
      ? FileResponseDto.fromEntity(location.brand.logoFile)
      : null;
    dto.timezone = location.timezone;
    dto.currency = location.currency;
    dto.bookingVisibility = location.bookingVisibility;
    return dto;
  }
}

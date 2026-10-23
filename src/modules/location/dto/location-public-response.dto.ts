import { ApiProperty } from '@nestjs/swagger';
import { BookingVisibility, BusinessType } from '@prisma/client';
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

  @ApiProperty({ enum: BusinessType, nullable: true })
  businessType: BusinessType | null;

  @ApiProperty({ type: String })
  countryCode: string;

  @ApiProperty({ type: String, nullable: true })
  city: string | null;

  @ApiProperty({ type: String, nullable: true })
  addressLine: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  instagram: string | null;

  @ApiProperty({ type: String, nullable: true })
  telegram: string | null;

  @ApiProperty({ type: String, nullable: true })
  whatsapp: string | null;

  @ApiProperty({ type: String, nullable: true })
  website: string | null;

  @ApiProperty({ type: String, nullable: true })
  mapWidgetUrl: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  logo: FileResponseDto | null;

  @ApiProperty({ type: String })
  timezone: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ enum: BookingVisibility })
  bookingVisibility: BookingVisibility;

  static fromEntity(
    location: LocationPublicProfile,
  ): LocationPublicResponseDto {
    const dto = new LocationPublicResponseDto();
    dto.id = location.id;
    dto.brandId = location.brandId;
    dto.brandName = location.brand.name;
    dto.name = location.name;
    dto.businessType = location.businessType;
    dto.countryCode = location.countryCode;
    dto.city = location.city;
    dto.addressLine = location.addressLine;
    dto.phone = location.phone;
    dto.instagram = location.instagram;
    dto.telegram = location.telegram;
    dto.whatsapp = location.whatsapp;
    dto.website = location.website;
    dto.mapWidgetUrl = location.mapWidgetUrl;
    dto.logo = location.brand.logoFile
      ? FileResponseDto.fromEntity(location.brand.logoFile)
      : null;
    dto.timezone = location.timezone;
    dto.currency = location.currency;
    dto.bookingVisibility = location.bookingVisibility;
    return dto;
  }
}

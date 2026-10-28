import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { BRAND_PROFILE_SELECT } from '../cache/brand-profile.cache.js';

export class BrandPublicResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  logo: FileResponseDto | null;

  static fromEntity(
    brand: Prisma.BrandGetPayload<{ select: typeof BRAND_PROFILE_SELECT }>,
  ): BrandPublicResponseDto {
    const dto = new BrandPublicResponseDto();
    dto.id = brand.id;
    dto.name = brand.name;
    dto.logo = brand.logoFile
      ? FileResponseDto.fromEntity(brand.logoFile)
      : null;
    return dto;
  }
}

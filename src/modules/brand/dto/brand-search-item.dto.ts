import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { BrandWithCounts } from '../interfaces/brand-with-counts.interface.js';

export class BrandSearchItemDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  logo: FileResponseDto | null;

  @ApiProperty({ enum: BusinessRole, nullable: true })
  myRole: BusinessRole | null;

  @ApiProperty({ type: Number })
  locationsCount: number;

  @ApiProperty({ type: Number })
  clientsCount: number;

  @ApiProperty({ type: Date })
  createdAt: Date;

  static fromEntity(brand: BrandWithCounts): BrandSearchItemDto {
    const dto = new BrandSearchItemDto();
    dto.id = brand.id;
    dto.name = brand.name;
    dto.logo = brand.logoFile
      ? FileResponseDto.fromEntity(brand.logoFile)
      : null;
    dto.myRole = brand.brandMemberships[0]?.role ?? null;
    dto.locationsCount = brand._count.locations;
    dto.clientsCount = brand._count.clients;
    dto.createdAt = brand.createdAt;
    return dto;
  }
}

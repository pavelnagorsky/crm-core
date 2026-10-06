import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { BrandWithLogo } from '../interfaces/brand-with-logo.interface.js';

export class BrandResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  logo: FileResponseDto | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(brand: BrandWithLogo): BrandResponseDto {
    const dto = new BrandResponseDto();
    dto.id = brand.id;
    dto.name = brand.name;
    dto.logo = brand.logoFile
      ? FileResponseDto.fromEntity(brand.logoFile)
      : null;
    dto.createdAt = brand.createdAt;
    dto.updatedAt = brand.updatedAt;
    return dto;
  }
}

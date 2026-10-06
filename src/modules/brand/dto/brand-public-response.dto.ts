import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { BrandWithLogo } from '../interfaces/brand-with-logo.interface.js';

export class BrandPublicResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  logo: FileResponseDto | null;

  static fromEntity(brand: BrandWithLogo): BrandPublicResponseDto {
    const dto = new BrandPublicResponseDto();
    dto.id = brand.id;
    dto.name = brand.name;
    dto.logo = brand.logoFile
      ? FileResponseDto.fromEntity(brand.logoFile)
      : null;
    return dto;
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { ProductStatus } from '../enums/product-status.enum.js';
import { ProductUnit } from '../enums/product-unit.enum.js';
import { ProductWithDetails } from '../interfaces/product-with-details.interface.js';
import { ProductLocationResponseDto } from './product-location-response.dto.js';

export class ProductResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ type: String, nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryName: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ type: String, nullable: true })
  barcode: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit: ProductUnit;

  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus' })
  status: ProductStatus;

  @ApiProperty({ type: () => ProductLocationResponseDto, isArray: true })
  locations: ProductLocationResponseDto[];

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(entity: ProductWithDetails): ProductResponseDto {
    return Object.assign(new ProductResponseDto(), entity, {
      categoryName: entity.category?.name ?? null,
      image: entity.imageFile
        ? FileResponseDto.fromEntity(entity.imageFile)
        : null,
      locations: entity.locations.map(ProductLocationResponseDto.fromEntity),
    });
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { ProductStatus } from '../enums/product-status.enum.js';
import { ProductUnit } from '../enums/product-unit.enum.js';
import { ProductWithDetails } from '../interfaces/product-with-details.interface.js';
import { ProductPackagingResponseDto } from './product-packaging-response.dto.js';
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

  @ApiProperty({ type: () => ProductPackagingResponseDto, isArray: true })
  packagings: ProductPackagingResponseDto[];

  static fromEntity(entity: ProductWithDetails): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.id = entity.id;
    dto.brandId = entity.brandId;
    dto.categoryId = entity.categoryId;
    dto.categoryName = entity.category?.name ?? null;
    dto.image = entity.imageFile
      ? FileResponseDto.fromEntity(entity.imageFile)
      : null;
    dto.name = entity.name;
    dto.description = entity.description;
    dto.sku = entity.sku;
    dto.barcode = entity.barcode;
    dto.unit = entity.unit;
    dto.status = entity.status;
    dto.locations = entity.locations.map(ProductLocationResponseDto.fromEntity);
    dto.packagings = entity.packagings.map(
      ProductPackagingResponseDto.fromEntity,
    );
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

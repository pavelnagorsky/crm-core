import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
import { ProductStatus } from '../enums/product-status.enum.js';
import { ProductUnit } from '../enums/product-unit.enum.js';
import { LocationProductView } from '../interfaces/location-product-view.interface.js';

export class LocationProductResponseDto {
  @ApiProperty({ type: String })
  productId: string;

  @ApiProperty({ type: String })
  locationId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ type: String, nullable: true })
  barcode: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryName: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit: ProductUnit;

  @ApiPrice()
  retailPrice: string;

  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus' })
  status: ProductStatus;

  @ApiProperty({ type: Boolean })
  trackInventory: boolean;

  @ApiProperty({ type: String, format: 'decimal' })
  reorderLevel: string;

  static fromEntity(entity: LocationProductView): LocationProductResponseDto {
    return Object.assign(new LocationProductResponseDto(), {
      productId: entity.productId,
      locationId: entity.locationId,
      name: entity.product.name,
      sku: entity.product.sku,
      barcode: entity.product.barcode,
      categoryId: entity.product.categoryId,
      categoryName: entity.product.category?.name ?? null,
      image: entity.product.imageFile
        ? FileResponseDto.fromEntity(entity.product.imageFile)
        : null,
      unit: entity.product.unit,
      retailPrice: MoneyService.format(entity.retailPrice),
      status: entity.status,
      trackInventory: entity.trackInventory,
      reorderLevel: QuantityService.format(entity.reorderLevel),
    });
  }
}

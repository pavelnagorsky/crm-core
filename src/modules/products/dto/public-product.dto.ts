import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ProductUnit } from '../enums/product-unit.enum.js';
import { PublicCatalogProduct } from '../interfaces/public-catalog-product.interface.js';

export class PublicProductDto {
  @ApiProperty({ type: String, format: 'uuid' })
  productId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit: ProductUnit;

  @ApiPrice({
    description: 'Retail price in the location currency, per base unit.',
  })
  retailPrice: string;

  static fromEntity(entity: PublicCatalogProduct): PublicProductDto {
    const dto = new PublicProductDto();
    dto.productId = entity.productId;
    dto.name = entity.product.name;
    dto.description = entity.product.description;
    dto.categoryId = entity.product.categoryId;
    dto.image = entity.product.imageFile
      ? FileResponseDto.fromEntity(entity.product.imageFile)
      : null;
    dto.unit = entity.product.unit;
    dto.retailPrice = MoneyUtils.format(entity.retailPrice);
    return dto;
  }
}

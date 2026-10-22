import { ApiProperty } from '@nestjs/swagger';
import { PublicCatalogProduct } from '../interfaces/public-catalog-product.interface.js';
import { PublicProductCategoryDto } from './public-product-category.dto.js';
import { PublicProductDto } from './public-product.dto.js';

export class PublicProductCatalogDto {
  @ApiProperty({ type: () => PublicProductCategoryDto, isArray: true })
  categories: PublicProductCategoryDto[];

  @ApiProperty({ type: () => PublicProductDto, isArray: true })
  items: PublicProductDto[];

  static fromEntities(
    products: PublicCatalogProduct[],
  ): PublicProductCatalogDto {
    const categories = new Map(
      products.flatMap(({ product }) =>
        product.category
          ? [[product.category.id, product.category] as const]
          : [],
      ),
    );
    const dto = new PublicProductCatalogDto();
    dto.categories = [...categories.values()]
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, 'ru') ||
          a.id.localeCompare(b.id),
      )
      .map(PublicProductCategoryDto.fromEntity);
    dto.items = products.map(PublicProductDto.fromEntity);
    return dto;
  }
}

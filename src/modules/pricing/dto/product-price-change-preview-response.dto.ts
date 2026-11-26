import { ApiProperty } from '@nestjs/swagger';
import { ProductPriceChangePreview } from '../interfaces/product-price-change-preview.interface.js';
import { ProductPriceChangeConflictDto } from './product-price-change-conflict.dto.js';
import { ProductPriceChangeCountsDto } from './product-price-change-counts.dto.js';
import { ProductPriceChangePreviewRowDto } from './product-price-change-preview-row.dto.js';

export class ProductPriceChangePreviewResponseDto {
  @ApiProperty({ type: String, example: '2027-01-01', description: 'The date "before" is taken on.' })
  date: string;

  @ApiProperty({ type: () => ProductPriceChangePreviewRowDto, isArray: true })
  rows: ProductPriceChangePreviewRowDto[];

  @ApiProperty({ type: () => ProductPriceChangeCountsDto })
  counts: ProductPriceChangeCountsDto;

  @ApiProperty({ type: () => ProductPriceChangeConflictDto, isArray: true })
  conflicts: ProductPriceChangeConflictDto[];

  static fromPreview(
    preview: ProductPriceChangePreview,
  ): ProductPriceChangePreviewResponseDto {
    return Object.assign(new ProductPriceChangePreviewResponseDto(), {
      date: preview.date,
      rows: preview.rows.map(ProductPriceChangePreviewRowDto.fromRow),
      counts: Object.assign(new ProductPriceChangeCountsDto(), preview.counts),
      conflicts: preview.conflicts.map(ProductPriceChangeConflictDto.fromConflict),
    });
  }
}

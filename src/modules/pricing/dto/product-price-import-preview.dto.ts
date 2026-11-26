import { ApiProperty } from '@nestjs/swagger';
import { ProductPriceImportPreview } from '../interfaces/product-price-import-preview.interface.js';
import { ProductPriceChangeConflictDto } from './product-price-change-conflict.dto.js';
import { ProductPriceChangePreviewRowDto } from './product-price-change-preview-row.dto.js';
import { ProductPriceImportCountsDto } from './product-price-import-counts.dto.js';
import { ProductPriceImportErrorDto } from './product-price-import-error.dto.js';

export class ProductPriceImportPreviewDto {
  @ApiProperty({ type: String, example: '2027-01-01' })
  date: string;

  @ApiProperty({ type: () => ProductPriceChangePreviewRowDto, isArray: true })
  rows: ProductPriceChangePreviewRowDto[];

  @ApiProperty({ type: () => ProductPriceImportErrorDto, isArray: true, description: 'The first 200 errors.' })
  errors: ProductPriceImportErrorDto[];

  @ApiProperty({ type: Number })
  errorCount: number;

  @ApiProperty({ type: () => ProductPriceImportCountsDto })
  counts: ProductPriceImportCountsDto;

  @ApiProperty({ type: () => ProductPriceChangeConflictDto, isArray: true })
  conflicts: ProductPriceChangeConflictDto[];

  @ApiProperty({ type: Boolean, description: 'No errors and at least one price changes.' })
  canApply: boolean;

  static fromPreview(preview: ProductPriceImportPreview): ProductPriceImportPreviewDto {
    return Object.assign(new ProductPriceImportPreviewDto(), {
      date: preview.date,
      rows: preview.rows.map(ProductPriceChangePreviewRowDto.fromRow),
      errors: preview.errors.map(ProductPriceImportErrorDto.fromEntry),
      errorCount: preview.errorCount,
      counts: Object.assign(new ProductPriceImportCountsDto(), preview.counts),
      conflicts: preview.conflicts.map(ProductPriceChangeConflictDto.fromConflict),
      canApply: preview.canApply,
    });
  }
}

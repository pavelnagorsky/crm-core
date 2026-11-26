import { ApiProperty } from '@nestjs/swagger';
import { ProductPriceImportRowError } from '../enums/product-price-import-row-error.enum.js';
import { ProductPriceImportErrorEntry } from '../interfaces/product-price-import-error-entry.interface.js';

export class ProductPriceImportErrorDto {
  @ApiProperty({ type: Number, description: 'Row number as in Excel.' })
  row: number;

  @ApiProperty({ type: String, nullable: true, description: 'The header of the column in the file.' })
  column: string | null;

  @ApiProperty({ enum: ProductPriceImportRowError, enumName: 'ProductPriceImportRowError' })
  code: ProductPriceImportRowError;

  static fromEntry(entry: ProductPriceImportErrorEntry): ProductPriceImportErrorDto {
    return Object.assign(new ProductPriceImportErrorDto(), entry);
  }
}

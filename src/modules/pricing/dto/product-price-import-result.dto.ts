import { ApiProperty } from '@nestjs/swagger';
import { ProductPriceImportResult } from '../interfaces/product-price-import-result.interface.js';
import { ProductPriceChangeSummaryDto } from './product-price-change-summary.dto.js';

export class ProductPriceImportResultDto {
  @ApiProperty({
    type: () => ProductPriceChangeSummaryDto,
    nullable: true,
    description: 'Null: the file changes no price.',
  })
  change: ProductPriceChangeSummaryDto | null;

  static fromResult(result: ProductPriceImportResult): ProductPriceImportResultDto {
    return Object.assign(new ProductPriceImportResultDto(), {
      change: result.change ? ProductPriceChangeSummaryDto.fromView(result.change) : null,
    });
  }
}

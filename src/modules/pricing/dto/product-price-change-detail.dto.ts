import { ApiProperty } from '@nestjs/swagger';
import { ProductPriceChangeDetailView } from '../interfaces/product-price-change-detail-view.interface.js';
import { ProductPriceChangeRowDto } from './product-price-change-row.dto.js';
import { ProductPriceChangeSummaryDto } from './product-price-change-summary.dto.js';

export class ProductPriceChangeDetailDto extends ProductPriceChangeSummaryDto {
  @ApiProperty({ type: () => ProductPriceChangeRowDto, isArray: true })
  rows: ProductPriceChangeRowDto[];

  static fromDetail(view: ProductPriceChangeDetailView): ProductPriceChangeDetailDto {
    const dto = ProductPriceChangeSummaryDto.fill(new ProductPriceChangeDetailDto(), view);
    dto.rows = view.rows.map(ProductPriceChangeRowDto.fromRow);
    return dto;
  }
}

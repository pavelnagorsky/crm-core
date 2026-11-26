import { ApiProperty } from '@nestjs/swagger';
import { ProductPriceChangeRollbackView } from '../interfaces/product-price-change-rollback-view.interface.js';
import { ProductPriceChangeDetailDto } from './product-price-change-detail.dto.js';
import { ProductPriceChangeRowDto } from './product-price-change-row.dto.js';

export class ProductPriceChangeRollbackResponseDto {
  @ApiProperty({ type: () => ProductPriceChangeDetailDto })
  change: ProductPriceChangeDetailDto;

  @ApiProperty({ type: Number })
  restoredCount: number;

  @ApiProperty({
    type: () => ProductPriceChangeRowDto,
    isArray: true,
    description: 'Rows not returned, with the price they had (current).',
  })
  skipped: ProductPriceChangeRowDto[];

  static fromView(
    view: ProductPriceChangeRollbackView,
  ): ProductPriceChangeRollbackResponseDto {
    return Object.assign(new ProductPriceChangeRollbackResponseDto(), {
      change: ProductPriceChangeDetailDto.fromDetail(view.detail),
      restoredCount: view.restoredCount,
      skipped: view.skipped.map(ProductPriceChangeRowDto.fromRow),
    });
  }
}

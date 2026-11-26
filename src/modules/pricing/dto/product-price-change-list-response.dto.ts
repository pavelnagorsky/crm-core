import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { ProductPriceChangeSummaryDto } from './product-price-change-summary.dto.js';
import { ServicePriceChangeStatusCountsDto } from './service-price-change-status-counts.dto.js';

export class ProductPriceChangeListResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => ProductPriceChangeSummaryDto, isArray: true })
  items: ProductPriceChangeSummaryDto[];

  @ApiProperty({ type: Number })
  pageSize: number;

  @ApiProperty({
    type: () => ServicePriceChangeStatusCountsDto,
    description: 'Product changes of the location by status, whatever the filter.',
  })
  counts: ServicePriceChangeStatusCountsDto;

  constructor(
    items: ProductPriceChangeSummaryDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    counts: ServicePriceChangeStatusCountsDto,
  ) {
    super(page, pageSize, totalItems);
    this.items = items;
    this.pageSize = pageSize;
    this.counts = counts;
  }
}

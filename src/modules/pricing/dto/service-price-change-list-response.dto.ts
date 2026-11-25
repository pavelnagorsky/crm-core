import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { ServicePriceChangeStatusCountsDto } from './service-price-change-status-counts.dto.js';
import { ServicePriceChangeSummaryDto } from './service-price-change-summary.dto.js';

export class ServicePriceChangeListResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => ServicePriceChangeSummaryDto, isArray: true })
  items: ServicePriceChangeSummaryDto[];

  @ApiProperty({ type: Number })
  pageSize: number;

  @ApiProperty({ type: () => ServicePriceChangeStatusCountsDto })
  counts: ServicePriceChangeStatusCountsDto;

  constructor(
    items: ServicePriceChangeSummaryDto[],
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

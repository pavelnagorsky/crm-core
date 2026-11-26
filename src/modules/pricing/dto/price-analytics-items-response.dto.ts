import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { PriceAnalyticsItemsPage } from '../interfaces/price-analytics-items-page.interface.js';
import { PriceAnalyticsItemDto } from './price-analytics-item.dto.js';
import { PriceAnalyticsTotalsDto } from './price-analytics-totals.dto.js';

/** A page of the items whose price was changed, newest first, then by id. */
export class PriceAnalyticsItemsResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => PriceAnalyticsItemDto, isArray: true })
  items: PriceAnalyticsItemDto[];

  @ApiProperty({
    type: () => PriceAnalyticsTotalsDto,
    description: 'Over all items of the filter, not the page.',
  })
  summary: PriceAnalyticsTotalsDto;

  @ApiProperty({ type: String, example: 'BYN' })
  currency: string;

  constructor(page: PriceAnalyticsItemsPage, pageNumber: number, pageSize: number) {
    super(pageNumber, pageSize, page.totalItems);
    this.items = page.items.map(PriceAnalyticsItemDto.fromItem);
    this.summary = PriceAnalyticsTotalsDto.fromTotals(page.summary);
    this.currency = page.currency;
  }
}

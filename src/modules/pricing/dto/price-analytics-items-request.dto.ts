import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { PRICE_ANALYTICS_MAX_PAGE_SIZE } from '../constants/price-analytics.constants.js';
import { PriceAnalyticsItemsFilterDto } from './price-analytics-items-filter.dto.js';

/**
 * A page of the items list: the period and filters plus page and pageSize (default 25, at
 * most 100).
 * The order is fixed (newest first), orderBy, orderDirection and isExport are ignored.
 */
export class PriceAnalyticsItemsRequestDto extends IntersectionType(
  PriceAnalyticsItemsFilterDto,
  PaginationRequestDto,
) {
  @ApiProperty({
    type: Number,
    default: 25,
    minimum: 1,
    maximum: PRICE_ANALYTICS_MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PRICE_ANALYTICS_MAX_PAGE_SIZE)
  override pageSize: number = 25;
}

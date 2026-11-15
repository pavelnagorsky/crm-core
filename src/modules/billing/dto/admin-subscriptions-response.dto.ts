import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { AdminSubscriptionItemDto } from './admin-subscription-item.dto.js';

export class AdminSubscriptionsResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => AdminSubscriptionItemDto, isArray: true })
  items: AdminSubscriptionItemDto[];

  constructor(
    items: AdminSubscriptionItemDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

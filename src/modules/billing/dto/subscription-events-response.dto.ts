import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { SubscriptionEventDto } from './subscription-event.dto.js';

export class SubscriptionEventsResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => SubscriptionEventDto, isArray: true })
  items: SubscriptionEventDto[];

  constructor(
    items: SubscriptionEventDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { PublicBookingPageListItemDto } from './public-booking-page-list-item.dto.js';

export class PublicBookingPageListResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => PublicBookingPageListItemDto, isArray: true })
  items: PublicBookingPageListItemDto[];

  constructor(
    items: PublicBookingPageListItemDto[],
    page: number,
    pageSize: number,
    totalItems: number,
  ) {
    super(page, pageSize, totalItems);
    this.items = items;
  }
}

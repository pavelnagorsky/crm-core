import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { BookingResponseDto } from './booking-response.dto.js';

export class BookingSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => BookingResponseDto, isArray: true })
  items: BookingResponseDto[];

  constructor(
    items: BookingResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

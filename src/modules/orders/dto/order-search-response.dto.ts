import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { OrderResponseDto } from './order-response.dto.js';

export class OrderSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => OrderResponseDto, isArray: true })
  items: OrderResponseDto[];

  constructor(
    items: OrderResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

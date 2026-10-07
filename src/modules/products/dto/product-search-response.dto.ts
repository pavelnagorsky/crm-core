import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { ProductResponseDto } from './product-response.dto.js';

export class ProductSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => ProductResponseDto, isArray: true })
  items: ProductResponseDto[];

  constructor(
    items: ProductResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

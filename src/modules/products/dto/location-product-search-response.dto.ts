import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { LocationProductResponseDto } from './location-product-response.dto.js';

export class LocationProductSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => LocationProductResponseDto, isArray: true })
  items: LocationProductResponseDto[];

  constructor(
    items: LocationProductResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

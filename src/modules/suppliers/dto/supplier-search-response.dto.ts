import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { SupplierResponseDto } from './supplier-response.dto.js';

export class SupplierSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => SupplierResponseDto, isArray: true })
  items: SupplierResponseDto[];

  constructor(
    items: SupplierResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

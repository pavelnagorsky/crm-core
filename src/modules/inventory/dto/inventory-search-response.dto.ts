import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { InventoryBalanceResponseDto } from './inventory-balance-response.dto.js';

export class InventorySearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => InventoryBalanceResponseDto, isArray: true })
  items: InventoryBalanceResponseDto[];

  constructor(
    items: InventoryBalanceResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

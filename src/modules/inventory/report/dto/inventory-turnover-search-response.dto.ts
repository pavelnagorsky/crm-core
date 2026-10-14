import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../../shared/dto/pagination-response.dto.js';
import { InventoryTurnoverLineDto } from './inventory-turnover-line.dto.js';

export class InventoryTurnoverSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => InventoryTurnoverLineDto, isArray: true })
  items: InventoryTurnoverLineDto[];

  @ApiProperty({ type: () => InventoryTurnoverLineDto })
  totals: InventoryTurnoverLineDto;

  constructor(
    items: InventoryTurnoverLineDto[],
    totals: InventoryTurnoverLineDto,
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
    this.totals = totals;
  }
}

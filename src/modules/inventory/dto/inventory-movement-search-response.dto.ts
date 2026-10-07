import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { InventoryMovementResponseDto } from './inventory-movement-response.dto.js';

export class InventoryMovementSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => InventoryMovementResponseDto, isArray: true })
  items: InventoryMovementResponseDto[];

  constructor(
    items: InventoryMovementResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { InventoryCountsView } from '../interfaces/inventory-counts-view.interface.js';

export class InventoryCountsResponseDto {
  @ApiProperty({ type: Number })
  totalCount: number;

  @ApiProperty({ type: Number })
  lowStockCount: number;

  @ApiProperty({ type: Number })
  outOfStockCount: number;

  static fromEntity(entity: InventoryCountsView): InventoryCountsResponseDto {
    return Object.assign(new InventoryCountsResponseDto(), entity);
  }
}

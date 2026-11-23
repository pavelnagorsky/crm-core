import { ApiProperty } from '@nestjs/swagger';
import { BulkFillItem } from '../interfaces/bulk-fill-item.interface.js';
import { PriceLevelFillItemDto } from './price-level-fill-item.dto.js';

export class PriceLevelFillPreviewResponseDto {
  @ApiProperty({ type: () => PriceLevelFillItemDto, isArray: true })
  items: PriceLevelFillItemDto[];

  static fromItems(items: BulkFillItem[]): PriceLevelFillPreviewResponseDto {
    const dto = new PriceLevelFillPreviewResponseDto();
    dto.items = items.map(PriceLevelFillItemDto.fromItem);
    return dto;
  }
}

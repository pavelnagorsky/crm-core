import { ApiProperty } from '@nestjs/swagger';
import { PriceLevelView } from '../interfaces/price-level-view.interface.js';

export class PriceLevelResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: Number })
  sortOrder: number;

  @ApiProperty({ type: Boolean })
  isDefault: boolean;

  @ApiProperty({ type: Number })
  staffCount: number;

  static fromView(level: PriceLevelView): PriceLevelResponseDto {
    const dto = new PriceLevelResponseDto();
    dto.id = level.id;
    dto.name = level.name;
    dto.sortOrder = level.sortOrder;
    dto.isDefault = level.isDefault;
    dto.staffCount = level.staffCount;
    return dto;
  }
}

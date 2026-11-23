import { ApiProperty } from '@nestjs/swagger';
import { PriceLevelMatrixCategory } from '../interfaces/price-level-matrix-category.interface.js';
import { PriceLevelMatrixRowDto } from './price-level-matrix-row.dto.js';

export class PriceLevelMatrixCategoryDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null: services without a category.',
  })
  id: string | null;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: () => PriceLevelMatrixRowDto, isArray: true })
  services: PriceLevelMatrixRowDto[];

  static fromCategory(
    category: PriceLevelMatrixCategory,
  ): PriceLevelMatrixCategoryDto {
    const dto = new PriceLevelMatrixCategoryDto();
    dto.id = category.id;
    dto.name = category.name;
    dto.services = category.services.map(PriceLevelMatrixRowDto.fromRow);
    return dto;
  }
}

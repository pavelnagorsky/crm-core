import { ApiProperty } from '@nestjs/swagger';
import { PriceLevelMatrix } from '../interfaces/price-level-matrix.interface.js';
import { PriceLevelMatrixCategoryDto } from './price-level-matrix-category.dto.js';
import { PriceLevelResponseDto } from './price-level-response.dto.js';

export class PriceLevelMatrixResponseDto {
  @ApiProperty({ type: () => PriceLevelResponseDto, isArray: true })
  levels: PriceLevelResponseDto[];

  @ApiProperty({ type: () => PriceLevelMatrixCategoryDto, isArray: true })
  categories: PriceLevelMatrixCategoryDto[];

  static fromMatrix(matrix: PriceLevelMatrix): PriceLevelMatrixResponseDto {
    const dto = new PriceLevelMatrixResponseDto();
    dto.levels = matrix.levels.map(PriceLevelResponseDto.fromView);
    dto.categories = matrix.categories.map(
      PriceLevelMatrixCategoryDto.fromCategory,
    );
    return dto;
  }
}

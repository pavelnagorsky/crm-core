import { ApiProperty } from '@nestjs/swagger';

export class PriceLevelFillResponseDto {
  @ApiProperty({ type: Number, description: 'Services whose level price changed.' })
  updated: number;

  static fromCount(updated: number): PriceLevelFillResponseDto {
    const dto = new PriceLevelFillResponseDto();
    dto.updated = updated;
    return dto;
  }
}

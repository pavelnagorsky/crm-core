import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
import { PriceLevelFillRequestDto } from './price-level-fill-request.dto.js';

export class PriceLevelFillApplyRequestDto extends PriceLevelFillRequestDto {
  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    description:
      'Services to write; prices are recomputed from the current base prices.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @IsUUID(undefined, { each: true })
  serviceIds: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ToArray } from '../../../shared/transforms/to-array.transform.js';

export class InventoryCountsRequestDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    required: false,
    description:
      'Filter by products. Repeat the key: ?productIds=UUID1&productIds=UUID2. A single value is accepted as a one-element array.',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsUUID('all', { each: true })
  productIds?: string[];
}

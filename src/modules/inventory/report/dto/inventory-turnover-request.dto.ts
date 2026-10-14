import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginationRequestDto } from '../../../../shared/dto/pagination-request.dto.js';
import regularExpressions from '../../../../shared/regular-expressions.js';
import { ToArray } from '../../../../shared/transforms/to-array.transform.js';
import { InventoryTurnoverOrderBy } from '../enums/inventory-turnover-order-by.enum.js';

export class InventoryTurnoverRequestDto extends PaginationRequestDto<InventoryTurnoverOrderBy> {
  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' })
  @Matches(regularExpressions.calendarDate)
  from: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  @Matches(regularExpressions.calendarDate)
  to: string;

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

  @ApiProperty({ enum: InventoryTurnoverOrderBy, required: false })
  @IsOptional()
  @IsEnum(InventoryTurnoverOrderBy)
  declare orderBy?: InventoryTurnoverOrderBy;
}

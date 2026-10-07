import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { InventoryMovementOrderBy } from '../enums/inventory-movement-order-by.enum.js';
import { InventoryMovementType } from '../enums/inventory-movement-type.enum.js';

export class InventoryMovementSearchRequestDto extends PaginationRequestDto<InventoryMovementOrderBy> {
  @ApiProperty({ enum: InventoryMovementType, required: false })
  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ enum: InventoryMovementOrderBy, required: false })
  @IsOptional()
  @IsEnum(InventoryMovementOrderBy)
  declare orderBy?: InventoryMovementOrderBy;
}

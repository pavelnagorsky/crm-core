import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { InventoryMovementOrderBy } from '../enums/inventory-movement-order-by.enum.js';
import { InventoryMovementType } from '../enums/inventory-movement-type.enum.js';

export class InventoryMovementSearchRequestDto extends PaginationRequestDto<InventoryMovementOrderBy> {
  @ApiProperty({ enum: InventoryMovementType, required: false })
  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @ApiProperty({ type: String, format: 'date', required: false })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiProperty({ type: String, format: 'date', required: false })
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiProperty({ enum: InventoryMovementOrderBy, required: false })
  @IsOptional()
  @IsEnum(InventoryMovementOrderBy)
  declare orderBy?: InventoryMovementOrderBy;
}

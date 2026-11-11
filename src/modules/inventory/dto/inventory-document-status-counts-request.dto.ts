import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { InventoryDocumentType } from '../enums/inventory-document-type.enum.js';

export class InventoryDocumentStatusCountsRequestDto {
  @ApiProperty({ enum: InventoryDocumentType, required: false })
  @IsOptional()
  @IsEnum(InventoryDocumentType)
  type?: InventoryDocumentType;

  @ApiProperty({ type: String, format: 'date', required: false })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiProperty({ type: String, format: 'date', required: false })
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}

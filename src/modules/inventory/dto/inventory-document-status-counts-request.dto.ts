import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { InventoryDocumentType } from '../enums/inventory-document-type.enum.js';

export class InventoryDocumentStatusCountsRequestDto {
  @ApiProperty({ enum: InventoryDocumentType, required: false })
  @IsOptional()
  @IsEnum(InventoryDocumentType)
  type?: InventoryDocumentType;

  @ApiProperty({ type: String, format: 'date', required: false })
  @IsOptional()
  @Matches(regularExpressions.calendarDate)
  from?: string;

  @ApiProperty({ type: String, format: 'date', required: false })
  @IsOptional()
  @Matches(regularExpressions.calendarDate)
  to?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}

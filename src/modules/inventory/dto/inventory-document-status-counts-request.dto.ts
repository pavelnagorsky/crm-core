import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { InventoryDocumentType } from '../enums/inventory-document-type.enum.js';

export class InventoryDocumentStatusCountsRequestDto {
  @ApiProperty({ enum: InventoryDocumentType, required: false })
  @IsOptional()
  @IsEnum(InventoryDocumentType)
  type?: InventoryDocumentType;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { InventoryDocumentOrderBy } from '../enums/inventory-document-order-by.enum.js';
import { InventoryDocumentStatus } from '../enums/inventory-document-status.enum.js';
import { InventoryDocumentType } from '../enums/inventory-document-type.enum.js';

export class InventoryDocumentSearchRequestDto extends PaginationRequestDto<InventoryDocumentOrderBy> {
  @ApiProperty({ enum: InventoryDocumentType, required: false })
  @IsOptional()
  @IsEnum(InventoryDocumentType)
  type?: InventoryDocumentType;

  @ApiProperty({ enum: InventoryDocumentStatus, required: false })
  @IsOptional()
  @IsEnum(InventoryDocumentStatus)
  status?: InventoryDocumentStatus;

  @ApiProperty({ enum: InventoryDocumentOrderBy, required: false })
  @IsOptional()
  @IsEnum(InventoryDocumentOrderBy)
  declare orderBy?: InventoryDocumentOrderBy;
}

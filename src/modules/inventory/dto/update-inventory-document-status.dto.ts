import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { InventoryDocumentTargetStatus } from '../enums/inventory-document-target-status.enum.js';

export class UpdateInventoryDocumentStatusDto {
  @ApiProperty({
    enum: InventoryDocumentTargetStatus,
    enumName: 'InventoryDocumentTargetStatus',
  })
  @IsEnum(InventoryDocumentTargetStatus)
  status: InventoryDocumentTargetStatus;
}

import { ApiProperty } from '@nestjs/swagger';
import { InventoryDocumentStatus } from '../enums/inventory-document-status.enum.js';

export class InventoryDocumentStatusCountResponseDto {
  @ApiProperty({
    enum: InventoryDocumentStatus,
    enumName: 'InventoryDocumentStatus',
  })
  status: InventoryDocumentStatus;

  @ApiProperty({ type: Number })
  count: number;
}

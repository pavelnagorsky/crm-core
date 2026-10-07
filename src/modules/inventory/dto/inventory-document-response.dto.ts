import { ApiProperty } from '@nestjs/swagger';
import { InventoryDocumentStatus } from '../enums/inventory-document-status.enum.js';
import { InventoryDocumentType } from '../enums/inventory-document-type.enum.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';
import { InventoryDocumentItemResponseDto } from './inventory-document-item-response.dto.js';

export class InventoryDocumentResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  locationId: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  destinationLocationId: string | null;

  @ApiProperty({
    enum: InventoryDocumentType,
    enumName: 'InventoryDocumentType',
  })
  type: InventoryDocumentType;

  @ApiProperty({
    enum: InventoryDocumentStatus,
    enumName: 'InventoryDocumentStatus',
  })
  status: InventoryDocumentStatus;

  @ApiProperty({ type: Date })
  occurredAt: Date;

  @ApiProperty({ type: String, nullable: true })
  reference: string | null;

  @ApiProperty({ type: String, nullable: true })
  supplierName: string | null;

  @ApiProperty({ type: String, nullable: true })
  reason: string | null;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ type: String })
  createdByName: string;

  @ApiProperty({ type: Date, nullable: true })
  postedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  voidedAt: Date | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  @ApiProperty({ type: () => InventoryDocumentItemResponseDto, isArray: true })
  items: InventoryDocumentItemResponseDto[];

  static fromEntity(
    entity: InventoryDocumentWithItems,
  ): InventoryDocumentResponseDto {
    return Object.assign(new InventoryDocumentResponseDto(), entity, {
      items: entity.items.map(InventoryDocumentItemResponseDto.fromEntity),
    });
  }
}

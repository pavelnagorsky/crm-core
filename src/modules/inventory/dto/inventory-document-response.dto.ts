import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { ApiSignedAmount } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { InventoryDocumentStatus } from '../enums/inventory-document-status.enum.js';
import { InventoryDocumentType } from '../enums/inventory-document-type.enum.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';
import { InventoryDocumentItemResponseDto } from './inventory-document-item-response.dto.js';
import { InventoryDocumentSupplierDto } from './inventory-document-supplier.dto.js';

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

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  supplierId: string | null;

  @ApiProperty({ type: () => InventoryDocumentSupplierDto, nullable: true })
  supplier: InventoryDocumentSupplierDto | null;

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

  @ApiSignedAmount({ nullable: true })
  totalCost: string | null;

  @ApiProperty({ type: () => InventoryDocumentItemResponseDto, isArray: true })
  items: InventoryDocumentItemResponseDto[];

  static fromEntity(
    entity: InventoryDocumentWithItems,
  ): InventoryDocumentResponseDto {
    const dto = new InventoryDocumentResponseDto();
    dto.id = entity.id;
    dto.locationId = entity.locationId;
    dto.destinationLocationId = entity.destinationLocationId;
    dto.type = entity.type;
    dto.status = entity.status;
    dto.occurredAt = entity.occurredAt;
    dto.reference = entity.reference;
    dto.supplierName = entity.supplierName;
    dto.supplierId = entity.supplierId;
    dto.supplier = InventoryDocumentSupplierDto.fromSnapshot(
      entity.supplierId,
      entity.supplierName,
    );
    dto.reason = entity.reason;
    dto.note = entity.note;
    dto.createdByName = entity.createdByName;
    dto.postedAt = entity.postedAt;
    dto.voidedAt = entity.voidedAt;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.items = entity.items.map(InventoryDocumentItemResponseDto.fromEntity);
    dto.totalCost = documentTotalCost(dto.items);
    return dto;
  }
}

function documentTotalCost(
  items: InventoryDocumentItemResponseDto[],
): string | null {
  if (items.length === 0) return null;
  let total = new Prisma.Decimal(0);
  for (const item of items) {
    if (item.totalCost == null) return null;
    total = total.plus(item.totalCost);
  }
  return MoneyService.format(total);
}

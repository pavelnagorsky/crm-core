import { Prisma, ProductUnit } from '@prisma/client';
import { InventoryDocumentStatus } from '../enums/inventory-document-status.enum.js';
import { InventoryDocumentType } from '../enums/inventory-document-type.enum.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';
import { InventoryDocumentItemResponseDto } from './inventory-document-item-response.dto.js';
import { InventoryDocumentResponseDto } from './inventory-document-response.dto.js';

function item(
  quantity: string,
  unitCost: string | null,
  id = 'item-1',
): InventoryDocumentWithItems['items'][number] {
  return {
    id,
    documentId: 'document-1',
    productLocationId: `location-product-${id}`,
    productId: `product-${id}`,
    productName: 'Шампунь',
    productSku: 'SH-1',
    productUnit: ProductUnit.PIECE,
    quantity: new Prisma.Decimal(quantity),
    unitCost: unitCost == null ? null : new Prisma.Decimal(unitCost),
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  };
}

function document(
  items: InventoryDocumentWithItems['items'],
  status = InventoryDocumentStatus.OPEN,
): InventoryDocumentWithItems {
  return {
    id: 'document-1',
    locationId: 'location-1',
    destinationLocationId: null,
    type: InventoryDocumentType.RECEIPT,
    status,
    occurredAt: new Date('2026-10-01T10:00:00.000Z'),
    reference: null,
    supplierName: null,
    reason: null,
    note: null,
    createdById: 'staff-1',
    createdByName: 'Анна',
    postedAt: null,
    voidedAt: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    items,
  };
}

describe('InventoryDocumentResponseDto totalCost', () => {
  it('rounds a line half-up to two decimal places', () => {
    const dto = InventoryDocumentItemResponseDto.fromEntity(
      item('1.125', '4.50'),
    );

    expect(dto.unitCost).toBe('4.50');
    expect(dto.totalCost).toBe('5.06');
    expect(dto.totalCost).toMatch(/^-?\d+\.\d{2}$/);
  });

  it('keeps the sign of a negative quantity', () => {
    const dto = InventoryDocumentItemResponseDto.fromEntity(
      item('-2.000', '3.50'),
    );

    expect(dto.quantity).toBe('-2.000');
    expect(dto.totalCost).toBe('-7.00');
  });

  it('rounds a halfway fraction away from zero', () => {
    expect(
      InventoryDocumentItemResponseDto.fromEntity(item('1.005', '1.00'))
        .totalCost,
    ).toBe('1.01');
    expect(
      InventoryDocumentItemResponseDto.fromEntity(item('-1.005', '1.00'))
        .totalCost,
    ).toBe('-1.01');
  });

  it('returns null for the line when unit cost is missing', () => {
    const dto = InventoryDocumentItemResponseDto.fromEntity(
      item('2.000', null),
    );

    expect(dto.unitCost).toBeNull();
    expect(dto.totalCost).toBeNull();
  });

  it('sums signed line totals for the document', () => {
    const dto = InventoryDocumentResponseDto.fromEntity(
      document([
        item('1.125', '4.50', 'item-1'),
        item('-2.000', '3.50', 'item-2'),
      ]),
    );

    expect(dto.items.map((line) => line.totalCost)).toEqual(['5.06', '-7.00']);
    expect(dto.totalCost).toBe('-1.94');
  });

  it('returns null for the document when any line has no cost', () => {
    const dto = InventoryDocumentResponseDto.fromEntity(
      document([
        item('1.000', '4.50', 'item-1'),
        item('2.000', null, 'item-2'),
      ]),
    );

    expect(dto.items[0].totalCost).toBe('4.50');
    expect(dto.items[1].totalCost).toBeNull();
    expect(dto.totalCost).toBeNull();
  });

  it('returns null for a document with no lines', () => {
    const dto = InventoryDocumentResponseDto.fromEntity(document([]));

    expect(dto.totalCost).toBeNull();
  });

  it.each([
    InventoryDocumentStatus.OPEN,
    InventoryDocumentStatus.POSTED,
    InventoryDocumentStatus.VOIDED,
  ])(
    'builds the total from saved quantity and unit cost when status is %s',
    (status) => {
      const dto = InventoryDocumentResponseDto.fromEntity(
        document([item('2.000', '6.25')], status),
      );

      expect(dto.status).toBe(status);
      expect(dto.totalCost).toBe('12.50');
    },
  );
});

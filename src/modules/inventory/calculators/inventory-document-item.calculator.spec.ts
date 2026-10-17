import { InventoryDocumentType, Prisma, ProductUnit } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { InventoryDocumentItemCalculator } from './inventory-document-item.calculator.js';

const service = new InventoryDocumentItemCalculator();
const packaging = {
  id: 'box-30',
  productId: 'shampoo',
  name: 'Box of 30',
  quantityInBaseUnit: new Prisma.Decimal(30),
  isActive: true,
};
const input = {
  productId: 'shampoo',
  packagingId: 'box-30',
  packageQuantity: '2.000',
  packageUnitCost: '100.00',
};

describe('InventoryDocumentItemCalculator', () => {
  it('preserves the exact package amount while normalizing quantity and unit cost', () => {
    const result = service.normalize(
      InventoryDocumentType.RECEIPT,
      input,
      ProductUnit.PIECE,
      packaging,
    );
    expect(result.quantity.toFixed(3)).toBe('60.000');
    expect(result.unitCost?.toFixed(8)).toBe('3.33333333');
    expect(result.totalCost?.toFixed(2)).toBe('200.00');
    expect(result.packagingFactor?.toString()).toBe('30');
    expect(result.packagingName).toBe('Box of 30');
  });

  it('uses a different factor for another product with the same packaging name', () => {
    const result = service.normalize(
      InventoryDocumentType.RECEIPT,
      { ...input, productId: 'comb', packagingId: 'box-50' },
      ProductUnit.PIECE,
      {
        ...packaging,
        id: 'box-50',
        productId: 'comb',
        quantityInBaseUnit: new Prisma.Decimal(50),
      },
    );
    expect(result.quantity.toString()).toBe('100');
  });

  it.each([
    { ...input, quantity: '60.000' },
    { ...input, unitCost: '3.33' },
    { ...input, packageQuantity: '0.500' },
    { ...input, packageQuantity: '0.000' },
    { ...input, packageUnitCost: undefined },
    { ...input, packageQuantity: '99999999999.000' },
    { productId: 'shampoo', quantity: '1.500', unitCost: '1.00' },
    { productId: 'shampoo', quantity: '1.000', packageUnitCost: '1.00' },
  ])(
    'rejects ambiguous, incomplete, fractional or overflowing input: %j',
    (item) => {
      expect(() =>
        service.normalize(
          InventoryDocumentType.RECEIPT,
          item,
          ProductUnit.PIECE,
          packaging,
        ),
      ).toThrow(AppException);
    },
  );

  it.each([undefined, { ...packaging, productId: 'another-product' }])(
    'rejects missing or foreign packaging',
    (value) => {
      expect(() =>
        service.normalize(
          InventoryDocumentType.RECEIPT,
          input,
          ProductUnit.PIECE,
          value,
        ),
      ).toThrow(AppException);
    },
  );

  it('rejects package count overflow even when the converted base quantity fits', () => {
    expect(() =>
      service.normalize(
        InventoryDocumentType.RECEIPT,
        {
          ...input,
          packageQuantity: '100000000000.000',
          packageUnitCost: '0.00',
        },
        ProductUnit.LITER,
        { ...packaging, quantityInBaseUnit: new Prisma.Decimal('0.001') },
      ),
    ).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.INVENTORY_QUANTITY_INVALID.code,
      }),
    );
  });

  it.each([
    InventoryDocumentType.WRITE_OFF,
    InventoryDocumentType.ADJUSTMENT,
    InventoryDocumentType.TRANSFER,
  ])('only allows packaging input for receipts: %s', (type) => {
    expect(() =>
      service.normalize(type, input, ProductUnit.PIECE, packaging),
    ).toThrow(AppException);
  });

  it('allows fractional base units for measurable products and preserves signed adjustments', () => {
    const result = service.normalize(
      InventoryDocumentType.ADJUSTMENT,
      { productId: 'bulk', quantity: '-1.125', unitCost: '4.50' },
      ProductUnit.LITER,
    );
    expect(result.quantity.toFixed(3)).toBe('-1.125');
    expect(result.totalCost?.toFixed(2)).toBe('-5.06');
    expect(result.packagingId).toBeNull();
  });
});

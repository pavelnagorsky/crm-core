import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { OrderComputeService } from './order-compute.service.js';

describe('OrderComputeService', () => {
  const service = new OrderComputeService();

  it('uses a custom price independently from the catalogue price', () => {
    const line = service.priceLine(
      new Prisma.Decimal('2.500'),
      new Prisma.Decimal('20.00'),
      new Prisma.Decimal('15.00'),
    );

    expect(line.listLineTotal.toFixed(2)).toBe('50.00');
    expect(line.unitPrice.toFixed(2)).toBe('15.00');
    expect(line.lineTotal.toFixed(2)).toBe('37.50');
    expect(line.discountTotal.toFixed(2)).toBe('0.00');
  });

  it('keeps custom price empty when catalogue price is used', () => {
    const line = service.priceLine(
      new Prisma.Decimal(3),
      new Prisma.Decimal('4.25'),
      null,
    );

    expect(line.customUnitPrice).toBeNull();
    expect(line.unitPrice.toFixed(2)).toBe('4.25');
    expect(line.lineTotal.toFixed(2)).toBe('12.75');
  });

  it('aggregates list, subtotal, discount, and final totals separately', () => {
    const lines = [
      service.priceLine(
        new Prisma.Decimal(2),
        new Prisma.Decimal(10),
        new Prisma.Decimal(8),
      ),
      service.priceLine(new Prisma.Decimal(1), new Prisma.Decimal(5), null),
    ];

    const totals = service.totals(lines);
    expect(totals.listTotalAmount.toFixed(2)).toBe('25.00');
    expect(totals.subtotalAmount.toFixed(2)).toBe('21.00');
    expect(totals.discountTotal.toFixed(2)).toBe('0.00');
    expect(totals.totalAmount.toFixed(2)).toBe('21.00');
  });
});

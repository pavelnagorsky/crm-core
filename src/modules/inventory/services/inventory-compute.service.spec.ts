import { InventoryDocumentType, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { InventoryComputeService } from './inventory-compute.service.js';

describe('InventoryComputeService', () => {
  const service = new InventoryComputeService();

  it('calculates weighted-average cost for incoming stock', () => {
    const result = service.nextState(
      {
        quantity: new Prisma.Decimal(10),
        averageUnitCost: new Prisma.Decimal(4),
      },
      new Prisma.Decimal(5),
      new Prisma.Decimal(7),
    );

    expect(result.quantity.toFixed(3)).toBe('15.000');
    expect(result.averageUnitCost.toFixed(2)).toBe('5.00');
  });

  it('keeps average cost on write-off and clears it at zero stock', () => {
    const before = {
      quantity: new Prisma.Decimal(3),
      averageUnitCost: new Prisma.Decimal('12.50'),
    };

    expect(
      service
        .nextState(before, new Prisma.Decimal(-1), new Prisma.Decimal(0))
        .averageUnitCost.toFixed(2),
    ).toBe('12.50');
    expect(
      service
        .nextState(before, new Prisma.Decimal(-3), new Prisma.Decimal(0))
        .averageUnitCost.toFixed(2),
    ).toBe('0.00');
  });

  it('derives write-off and stocktake deltas', () => {
    expect(
      service
        .documentDelta(
          InventoryDocumentType.WRITE_OFF,
          new Prisma.Decimal(2),
          new Prisma.Decimal(9),
        )
        .toFixed(3),
    ).toBe('-2.000');
    expect(
      service
        .documentDelta(
          InventoryDocumentType.STOCKTAKE,
          new Prisma.Decimal(6),
          new Prisma.Decimal(9),
        )
        .toFixed(3),
    ).toBe('-3.000');
  });
});

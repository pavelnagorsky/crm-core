import { InventoryDocumentType, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { InventoryComputeService } from './inventory-compute.service.js';

describe('InventoryComputeService', () => {
  const service = new InventoryComputeService();

  it('allocates outgoing value from the exact balance when the average rate rounds to zero', () => {
    const result = service.nextState(
      {
        quantity: new Prisma.Decimal('10000000000'),
        averageUnitCost: new Prisma.Decimal(0),
        stockValue: new Prisma.Decimal(40),
      },
      new Prisma.Decimal('-5000000000'),
      new Prisma.Decimal(0),
    );
    expect(result.totalCost.toFixed(2)).toBe('-20.00');
    expect(result.stockValue.toFixed(2)).toBe('20.00');
  });

  it('rejects aggregate quantity overflow before writing a movement', () => {
    expect(() =>
      service.nextState(
        {
          quantity: new Prisma.Decimal('99999999999'),
          averageUnitCost: new Prisma.Decimal(0),
          stockValue: new Prisma.Decimal(0),
        },
        new Prisma.Decimal(1),
        new Prisma.Decimal(0),
      ),
    ).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.INVENTORY_QUANTITY_INVALID.code,
      }),
    );
  });

  it('rejects aggregate value overflow when both the existing balance and receipt fit separately', () => {
    expect(() =>
      service.nextState(
        {
          quantity: new Prisma.Decimal(100),
          averageUnitCost: new Prisma.Decimal('6000000000'),
          stockValue: new Prisma.Decimal('600000000000'),
        },
        new Prisma.Decimal(100),
        new Prisma.Decimal('6000000000'),
      ),
    ).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.INVENTORY_VALUE_OUT_OF_RANGE.code,
      }),
    );
  });

  it('calculates weighted-average cost for incoming stock', () => {
    const result = service.nextState(
      {
        quantity: new Prisma.Decimal(10),
        stockValue: new Prisma.Decimal(40),
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
      stockValue: new Prisma.Decimal(37.5),
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

  it('derives write-off and receipt deltas', () => {
    expect(
      service
        .documentDelta(InventoryDocumentType.WRITE_OFF, new Prisma.Decimal(2))
        .toFixed(3),
    ).toBe('-2.000');
    expect(
      service
        .documentDelta(InventoryDocumentType.RECEIPT, new Prisma.Decimal(6))
        .toFixed(3),
    ).toBe('6.000');
  });

  it('keeps every cent when a 100.00 package of 30 pieces is sold individually', () => {
    let state = service.nextState(
      {
        quantity: new Prisma.Decimal(0),
        averageUnitCost: new Prisma.Decimal(0),
        stockValue: new Prisma.Decimal(0),
      },
      new Prisma.Decimal(30),
      new Prisma.Decimal('3.33333333'),
      new Prisma.Decimal(100),
    );
    let soldCost = new Prisma.Decimal(0);
    for (let i = 0; i < 30; i++) {
      state = service.nextState(
        state,
        new Prisma.Decimal(-1),
        state.averageUnitCost,
      );
      soldCost = soldCost.minus(state.totalCost);
      expect(state.stockValue.gte(0)).toBe(true);
    }
    expect(soldCost.toFixed(2)).toBe('100.00');
    expect(state.quantity.toString()).toBe('0');
    expect(state.stockValue.toString()).toBe('0');
    expect(state.averageUnitCost.toString()).toBe('0');
  });

  it('carries the exact remaining value when the last units are transferred', () => {
    const outgoing = service.nextState(
      {
        quantity: new Prisma.Decimal(3),
        averageUnitCost: new Prisma.Decimal('3.33333333'),
        stockValue: new Prisma.Decimal(10),
      },
      new Prisma.Decimal(-3),
      new Prisma.Decimal('3.33333333'),
    );
    const incoming = service.nextState(
      {
        quantity: new Prisma.Decimal(0),
        averageUnitCost: new Prisma.Decimal(0),
        stockValue: new Prisma.Decimal(0),
      },
      new Prisma.Decimal(3),
      new Prisma.Decimal('3.33333333'),
      outgoing.totalCost.neg(),
    );
    expect(outgoing.stockValue.toString()).toBe('0');
    expect(incoming.stockValue.toFixed(2)).toBe('10.00');
    expect(incoming.totalCost.plus(outgoing.totalCost).toString()).toBe('0');
  });
});

import { Prisma, ProductUnit } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { ProductPackagingService } from './product-packaging.service.js';

const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };
const packaging = {
  id: 'box',
  productId: 'shampoo',
  name: 'Box',
  quantityInBaseUnit: new Prisma.Decimal(30),
  isActive: true,
};

function setup(unit: ProductUnit = ProductUnit.PIECE) {
  const db = {
    $transaction: vi.fn((operation: (tx: unknown) => unknown): unknown =>
      operation(db),
    ),
    productPackaging: {
      create: vi.fn().mockResolvedValue(packaging),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const products = {
    resolveForPackagingCreation: vi
      .fn()
      .mockResolvedValue({ id: 'shampoo', unit }),
  };
  const events = { emit: vi.fn() };
  return {
    db,
    products,
    events,
    service: new ProductPackagingService(
      db as never,
      products as never,
      events as never,
    ),
  };
}

describe('ProductPackagingService', () => {
  it('resolves only active packaging from the requested brand using the supplied transaction', async () => {
    const { service, db } = setup();
    const tx = {
      productPackaging: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await service.resolveForReceipt('brand', ['box', 'box'], tx as never);
    expect(tx.productPackaging.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['box'] },
        isActive: true,
        product: { brand: { deletedAt: null }, brandId: 'brand' },
      },
    });
    expect(db.productPackaging.findMany).not.toHaveBeenCalled();
  });
  it('creates product-specific packaging after verifying brand ownership and emits an audit event', async () => {
    const { db, products, events, service } = setup();
    await service.create(
      'brand',
      'shampoo',
      { name: ' Box ', quantityInBaseUnit: '30.000' },
      actor,
    );
    expect(products.resolveForPackagingCreation).toHaveBeenCalledWith(
      'brand',
      'shampoo',
      db,
    );
    expect(db.productPackaging.create).toHaveBeenCalledWith({
      data: {
        productId: 'shampoo',
        name: 'Box',
        quantityInBaseUnit: new Prisma.Decimal(30),
      },
    });
    expect(events.emit).toHaveBeenCalledOnce();
  });

  it.each(['0.000', '-1.000', '1.500'])(
    'rejects invalid piece packaging factors: %s',
    async (factor) => {
      const { db, service } = setup();
      await expect(
        service.create(
          'brand',
          'shampoo',
          { name: 'Box', quantityInBaseUnit: factor },
          actor,
        ),
      ).rejects.toBeInstanceOf(AppException);
      expect(db.productPackaging.create).not.toHaveBeenCalled();
    },
  );

  it('supports fractional factors for measurable products', async () => {
    const { service } = setup(ProductUnit.LITER);
    await expect(
      service.create(
        'brand',
        'shampoo',
        { name: 'Bottle', quantityInBaseUnit: '0.500' },
        actor,
      ),
    ).resolves.toBeDefined();
  });

  it('maps duplicate packaging names to a domain error', async () => {
    const { db, service } = setup();
    db.productPackaging.create.mockRejectedValue({
      code: PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
    });
    await expect(
      service.create(
        'brand',
        'shampoo',
        { name: 'Box', quantityInBaseUnit: '30.000' },
        actor,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('prevents changing packaging from another product or brand', async () => {
    const { db, service } = setup();
    db.productPackaging.findFirst.mockResolvedValue(null);
    await expect(
      service.changeStatus('brand', 'shampoo', 'box', false, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.productPackaging.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'box',
        productId: 'shampoo',
        product: { brand: { deletedAt: null }, brandId: 'brand' },
      },
    });
    expect(db.productPackaging.update).not.toHaveBeenCalled();
  });

  it('archives packaging without changing its conversion factor', async () => {
    const { db, service } = setup();
    db.productPackaging.findFirst.mockResolvedValue(packaging);
    db.productPackaging.update.mockResolvedValue({
      ...packaging,
      isActive: false,
    });
    await service.changeStatus('brand', 'shampoo', 'box', false, actor);
    expect(db.productPackaging.update).toHaveBeenCalledWith({
      where: { id: 'box' },
      data: { isActive: false },
    });
  });
});

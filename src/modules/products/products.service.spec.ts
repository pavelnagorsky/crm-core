import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductStatus } from '@prisma/client';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { LocationService } from '../location/location.service.js';
import { ProductLocationSearchOrderBy } from './enums/product-location-search-order-by.enum.js';
import { ProductsService } from './products.service.js';

const actor = { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER };

function setup() {
  const db = {
    product: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    productCategory: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    productLocation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn((values: unknown[]) => Promise.all(values)),
  };
  const locations = {
    findById: vi.fn(),
  };
  const events = { emit: vi.fn() };
  const service = new ProductsService(
    db as never,
    locations as unknown as LocationService,
    events as unknown as EventEmitter2,
  );
  return { db, locations, events, service };
}

describe('ProductsService', () => {
  it('normalizes optional product codes and text on create', async () => {
    const { db, service } = setup();
    db.product.create.mockResolvedValue({
      id: 'product-1',
      brandId: 'brand-1',
      name: 'Shampoo',
      sku: 'SKU-1',
      barcode: '123',
      unit: 'PIECE',
    });

    await service.create(
      'brand-1',
      {
        name: ' Shampoo ',
        description: '  ',
        sku: ' sku-1 ',
        barcode: ' 123 ',
      },
      actor,
    );

    expect(db.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        name: 'Shampoo',
        description: null,
        sku: 'SKU-1',
        barcode: '123',
      }),
    });
  });

  it('maps barcode uniqueness to the domain error', async () => {
    const { db, service } = setup();
    db.product.create.mockRejectedValue({
      code: PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
      meta: { target: ['brandId', 'barcode'] },
    });

    await expect(
      service.create('brand-1', { name: 'Shampoo', barcode: '123' }, actor),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('only enables a product in a location from the same brand', async () => {
    const { db, locations, service } = setup();
    locations.findById.mockResolvedValue({
      id: 'location-1',
      brandId: 'brand-1',
    });
    db.product.findFirst.mockResolvedValue({
      id: 'product-1',
      brandId: 'brand-1',
      name: 'Shampoo',
      locations: [],
      category: null,
      imageFile: null,
    });
    db.productLocation.findUnique.mockResolvedValue(null);
    db.productLocation.upsert.mockResolvedValue({
      id: 'setting-1',
      productId: 'product-1',
      locationId: 'location-1',
      retailPrice: '10.00',
      status: ProductStatus.ACTIVE,
      trackInventory: true,
      reorderLevel: '2.000',
    });

    await service.upsertLocation(
      'location-1',
      'product-1',
      {
        retailPrice: '10.00',
        status: ProductStatus.ACTIVE,
        trackInventory: true,
        reorderLevel: '2.000',
      },
      actor,
    );

    expect(db.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1', brandId: 'brand-1' },
      }),
    );
    expect(db.productLocation.upsert).toHaveBeenCalledOnce();
  });

  it('orders location products by the nested product name', async () => {
    const { db, service } = setup();
    db.productLocation.findMany.mockResolvedValue([]);
    db.productLocation.count.mockResolvedValue(0);

    await service.searchLocation('location-1', {
      page: 1,
      pageSize: 25,
      orderBy: ProductLocationSearchOrderBy.NAME,
    });

    expect(db.productLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ product: { name: 'desc' } }, { id: 'desc' }],
      }),
    );
  });

  it('does not allow inventory tracking to be disabled after activation', async () => {
    const { db, locations, service } = setup();
    locations.findById.mockResolvedValue({
      id: 'location-1',
      brandId: 'brand-1',
    });
    db.product.findFirst.mockResolvedValue({
      id: 'product-1',
      brandId: 'brand-1',
      name: 'Shampoo',
      locations: [],
      category: null,
      imageFile: null,
    });
    db.productLocation.findUnique.mockResolvedValue({ trackInventory: true });

    await expect(
      service.upsertLocation(
        'location-1',
        'product-1',
        {
          retailPrice: '10.00',
          status: ProductStatus.ACTIVE,
          trackInventory: false,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(AppException);
    expect(db.productLocation.upsert).not.toHaveBeenCalled();
  });

  it('rejects a no-op status transition', async () => {
    const { db, service } = setup();
    db.product.findFirst.mockResolvedValue({
      id: 'product-1',
      brandId: 'brand-1',
      status: ProductStatus.ACTIVE,
      locations: [],
      category: null,
      imageFile: null,
    });

    await expect(
      service.changeStatus('brand-1', 'product-1', ProductStatus.ACTIVE, actor),
    ).rejects.toBeInstanceOf(AppException);
  });
});

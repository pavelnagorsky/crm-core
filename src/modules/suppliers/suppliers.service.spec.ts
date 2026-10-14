import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { SuppliersService } from './suppliers.service.js';

function setup() {
  const db = {
    supplier: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  return {
    db,
    service: new SuppliersService(db as never),
  };
}

describe('SuppliersService', () => {
  it('creates a supplier with a normalized unique name key', async () => {
    const { service, db } = setup();
    db.supplier.create.mockResolvedValue({ id: 'supplier-1' });

    await service.create('brand-1', {
      name: '  Acme   Supply  ',
      phone: ' +375 29 000-00-00 ',
    });

    expect(db.supplier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        name: 'Acme   Supply',
        normalizedName: 'acme supply',
        phone: '+375 29 000-00-00',
      }),
    });
  });

  it('maps duplicate supplier names to a domain error code', async () => {
    const { service, db } = setup();
    db.supplier.create.mockRejectedValue({
      code: PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
    });

    await expect(
      service.create('brand-1', { name: 'Acme Supply' }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.SUPPLIER_NAME_EXISTS.code,
    });
  });

  it('rejects inactive suppliers for inventory documents', async () => {
    const { service, db } = setup();
    db.supplier.findFirst.mockResolvedValue({
      id: 'supplier-1',
      brandId: 'brand-1',
      isActive: false,
    });

    await expect(
      service.resolveActiveForDocument('brand-1', 'supplier-1'),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.SUPPLIER_INACTIVE.code,
    });
  });

  it('returns only active lightweight options', async () => {
    const { service, db } = setup();
    db.supplier.findMany.mockResolvedValue([
      { id: 'supplier-1', name: 'Acme' },
    ]);

    const options = await service.listOptions('brand-1', { search: 'ac' });

    expect(options).toEqual([{ id: 'supplier-1', name: 'Acme' }]);
    expect(db.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isActive: true,
        }),
        select: { id: true, name: true },
        take: 20,
      }),
    );
  });
});

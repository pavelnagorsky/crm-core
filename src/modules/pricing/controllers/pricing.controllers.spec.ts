import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessRole, Prisma } from '@prisma/client';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { PriceLevelsController } from './price-levels.controller.js';
import { ServicePricesController } from './service-prices.controller.js';

const d = (value: string) => new Prisma.Decimal(value);

const allowed = (
  controller: new (...args: never[]) => object,
  handler: string,
  role: BusinessRole,
): boolean => {
  const context = {
    getHandler: () =>
      (controller.prototype as Record<string, () => unknown>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user: tokenPayload(role),
        params: { locationId: 'location-1' },
      }),
    }),
  } as unknown as ExecutionContext;
  try {
    return new PermissionGuard(new Reflector()).canActivate(context) === true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
};

describe('Pricing controllers', () => {
  const levels = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const prices = {
    getServicePrices: vi.fn(),
    setLevelPrices: vi.fn(),
    setStaffPrices: vi.fn(),
    getStaffServicePrices: vi.fn(),
    setStaffServicePrices: vi.fn(),
  };
  const levelsController = new PriceLevelsController(levels as never);
  const pricesController = new ServicePricesController(prices as never);
  const token = tokenPayload(BusinessRole.OWNER);
  const level = {
    id: 'level-1',
    locationId: 'location-1',
    name: 'Top',
    sortOrder: 1,
    isDefault: false,
    staffCount: 3,
  };

  beforeEach(() => vi.resetAllMocks());

  it('maps price levels to the contract shape', async () => {
    levels.list.mockResolvedValue([level]);
    const result = await levelsController.list('location-1');
    expect(result.responseValue).toEqual([
      {
        id: 'level-1',
        name: 'Top',
        sortOrder: 1,
        isDefault: false,
        staffCount: 3,
      },
    ]);
  });

  it('creates, updates and deletes a level with an audit actor', async () => {
    levels.create.mockResolvedValue(level);
    levels.update.mockResolvedValue({ ...level, isDefault: true });
    const created = await levelsController.create(
      'location-1',
      { name: 'Top' },
      token,
    );
    expect(created.responseValue?.id).toBe('level-1');
    expect(levels.create).toHaveBeenCalledWith(
      'location-1',
      { name: 'Top' },
      expect.objectContaining({ id: 'user-1' }),
    );
    const updated = await levelsController.update(
      'location-1',
      'level-1',
      { isDefault: true },
      token,
    );
    expect(updated.responseValue?.isDefault).toBe(true);
    await expect(
      levelsController.delete('location-1', 'level-1', token),
    ).resolves.toBeUndefined();
    expect(levels.delete).toHaveBeenCalledWith(
      'location-1',
      'level-1',
      expect.objectContaining({ id: 'user-1' }),
    );
  });

  it('returns service prices as two-digit strings', async () => {
    prices.getServicePrices.mockResolvedValue({
      serviceId: 'cut',
      basePrice: d('50'),
      priceFrom: d('50'),
      priceTo: d('95.5'),
      levels: [
        {
          levelId: 'top',
          name: 'Top',
          isDefault: false,
          price: d('80'),
          staffCount: 1,
        },
      ],
      staff: [
        {
          staffId: 'a',
          name: 'Anna',
          avatarFile: { id: 'f', fileName: 'a.png', url: 'https://cdn/a.png' },
          status: 'ACTIVE',
          levelId: 'top',
          levelName: 'Top',
          levelPrice: d('80'),
          personalPrice: d('95.5'),
          price: d('95.5'),
        },
      ],
    });
    const result = await pricesController.getServicePrices('location-1', 'cut');
    expect(result.responseValue).toEqual({
      serviceId: 'cut',
      basePrice: '50.00',
      priceFrom: '50.00',
      priceTo: '95.50',
      levels: [
        {
          levelId: 'top',
          name: 'Top',
          isDefault: false,
          price: '80.00',
          staffCount: 1,
        },
      ],
      staff: [
        {
          staffId: 'a',
          name: 'Anna',
          avatarUrl: 'https://cdn/a.png',
          status: 'ACTIVE',
          levelId: 'top',
          levelName: 'Top',
          levelPrice: '80.00',
          personalPrice: '95.50',
          price: '95.50',
        },
      ],
    });
  });

  it('returns staff service prices with a null personal price', async () => {
    prices.getStaffServicePrices.mockResolvedValue({
      staffId: 'a',
      levelId: null,
      items: [
        {
          serviceId: 'cut',
          serviceTitle: 'Cut',
          basePrice: d('50'),
          levelPrice: d('50'),
          personalPrice: null,
          price: d('50'),
        },
      ],
    });
    const result = await pricesController.getStaffServicePrices(
      'location-1',
      'a',
    );
    expect(result.responseValue).toEqual({
      staffId: 'a',
      levelId: null,
      items: [
        {
          serviceId: 'cut',
          serviceTitle: 'Cut',
          basePrice: '50.00',
          levelPrice: '50.00',
          personalPrice: null,
          price: '50.00',
        },
      ],
    });
  });

  describe('permissions', () => {
    const reads: [new (...args: never[]) => object, string][] = [
      [PriceLevelsController, 'list'],
      [ServicePricesController, 'getServicePrices'],
      [ServicePricesController, 'getStaffServicePrices'],
    ];
    const writes: [new (...args: never[]) => object, string][] = [
      [PriceLevelsController, 'create'],
      [PriceLevelsController, 'update'],
      [PriceLevelsController, 'delete'],
      [ServicePricesController, 'setLevelPrices'],
      [ServicePricesController, 'setStaffPrices'],
      [ServicePricesController, 'setStaffServicePrices'],
    ];

    it.each([...reads, ...writes])(
      '%s.%s is open to the owner and the manager, closed to staff',
      (controller, handler) => {
        expect(allowed(controller, handler, BusinessRole.OWNER)).toBe(true);
        expect(allowed(controller, handler, BusinessRole.MANAGER)).toBe(true);
        expect(allowed(controller, handler, BusinessRole.STAFF)).toBe(false);
      },
    );
  });
});

import { BusinessRole, UserRole } from '@prisma/client';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { BrandService } from '../services/brand.service.js';
import { BrandController } from './brand.controller.js';

describe('Brand search access boundaries', () => {
  const findMany = vi.fn();
  const service = new BrandService(
    { brand: { findMany } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const controller = new BrandController(service);
  const brands = ['brand-1', 'brand-2'].map((id) => ({
    id,
    name: id,
    logoFile: null,
    createdAt: new Date('2026-10-17T10:00:00Z'),
    _count: { locations: 1, clients: 3 },
  }));

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue(brands);
  });

  it('limits brands and location counts to memberships and preserves direct brand roles', async () => {
    const token = tokenPayload(BusinessRole.MANAGER);
    token.brandMemberships = [
      { brandId: 'brand-1', role: BusinessRole.MANAGER },
    ];
    token.locationMemberships = [
      {
        brandId: 'brand-1',
        locationId: 'location-1',
        role: BusinessRole.MANAGER,
        inherited: true,
      },
      {
        brandId: 'brand-1',
        locationId: 'location-1',
        role: BusinessRole.OWNER,
        inherited: false,
      },
      {
        brandId: 'brand-2',
        locationId: 'location-2',
        role: BusinessRole.STAFF,
        inherited: false,
      },
    ];

    const response = await controller.search(token, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, id: { in: ['brand-1', 'brand-2'] } },
        include: expect.objectContaining({
          _count: {
            select: {
              locations: {
                where: {
                  deletedAt: null,
                  brand: { deletedAt: null },
                  id: { in: ['location-1', 'location-2'] },
                },
              },
              clients: true,
            },
          },
        }),
      }),
    );
    expect(response.responseValue).toEqual([
      expect.objectContaining({
        id: 'brand-1',
        myRole: BusinessRole.MANAGER,
        locationsCount: 1,
        clientsCount: 3,
      }),
      expect.objectContaining({ id: 'brand-2', myRole: null }),
    ]);
  });

  it('allows platform admins to search all active brands and count all active locations', async () => {
    const token = tokenPayload();
    token.role = UserRole.ADMIN;
    token.permissions = { '*': ['*'] };
    token.brandMemberships = [];
    token.locationMemberships = [];

    const response = await controller.search(token, {});

    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual({ deletedAt: null });
    expect(query.include._count.select.locations.where).toEqual({
      deletedAt: null,
      brand: { deletedAt: null },
    });
    expect(response.responseValue?.map((row) => row.myRole)).toEqual([
      null,
      null,
    ]);
  });

  it.each([UserRole.USER, UserRole.ADMIN])(
    'keeps empty memberships restrictive without a global grant for %s',
    async (role) => {
      const token = tokenPayload();
      token.role = role;
      token.brandMemberships = [];
      token.locationMemberships = [];
      findMany.mockResolvedValue([]);

      const response = await controller.search(token, {});

      const query = findMany.mock.calls[0][0];
      expect(query.where.id).toEqual({ in: [] });
      expect(query.include._count.select.locations.where.id).toEqual({
        in: [],
      });
      expect(response.responseValue).toEqual([]);
    },
  );
});

import { BadRequestException } from '@nestjs/common';
import { BusinessRole, BusinessType } from '@prisma/client';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { BrandService } from './brand.service.js';

describe('BrandService first location', () => {
  const db = {
    brand: {
      create: vi
        .fn()
        .mockResolvedValue({ id: 'brand-1', locations: [{ staff: [] }] }),
    },
  };
  const users = {
    findById: vi.fn().mockResolvedValue({
      firstName: 'Anna',
      lastName: 'Ivanova',
      email: 'anna@example.com',
      phone: null,
    }),
  };
  const epoch = { bump: vi.fn() };
  const service = new BrandService(
    db as never,
    users as never,
    { emit: vi.fn() } as never,
    epoch as never,
  );
  const actor = { id: 'user-1', name: 'Anna', role: AuditActorRole.OWNER };
  const dto = {
    name: 'Brand',
    location: {
      name: 'First location',
      countryCode: 'by',
      currency: 'byn',
      timezone: 'Europe/Minsk',
      businessType: BusinessType.BEAUTY_SALON,
    },
  };

  beforeEach(() => vi.clearAllMocks());

  it('creates the first location with normalized locale, business type and owner access', async () => {
    await service.create('user-1', dto, actor);

    const membership = {
      create: { userId: 'user-1', role: BusinessRole.OWNER },
    };
    expect(db.brand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandMemberships: membership,
          locations: {
            create: expect.objectContaining({
              countryCode: 'BY',
              currency: 'BYN',
              timezone: 'Europe/Minsk',
              businessType: BusinessType.BEAUTY_SALON,
              locationMemberships: membership,
            }),
          },
        }),
      }),
    );
    expect(epoch.bump).toHaveBeenCalledWith('user-1');
  });

  it.each([
    { countryCode: 'ZZ' },
    { currency: 'USD' },
    { timezone: 'America/New_York' },
  ])(
    'rejects an invalid first location before creating the brand: %j',
    async (overrides) => {
      await expect(
        service.create(
          'user-1',
          { ...dto, location: { ...dto.location, ...overrides } },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(db.brand.create).not.toHaveBeenCalled();
      expect(epoch.bump).not.toHaveBeenCalled();
    },
  );
});

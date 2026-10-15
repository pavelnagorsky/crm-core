import { BadRequestException } from '@nestjs/common';
import { BusinessType } from '@prisma/client';
import { LocationService } from './location.service.js';

describe('LocationService locale and business type', () => {
  const location = {
    id: 'location-1',
    brandId: 'brand-1',
    name: 'Location',
    countryCode: 'BY',
    currency: 'BYN',
    timezone: 'Europe/Minsk',
    businessType: BusinessType.BEAUTY_SALON,
  };
  const db = {
    location: {
      create: vi.fn().mockResolvedValue(location),
      findUnique: vi.fn().mockResolvedValue(location),
      update: vi.fn(),
    },
  };
  const brands = { findMemberUserIds: vi.fn().mockResolvedValue(['user-1']) };
  const epoch = { bumpMany: vi.fn() };
  const service = new LocationService(
    db as never,
    brands as never,
    epoch as never,
  );

  beforeEach(() => vi.clearAllMocks());

  it('normalizes the locale when creating another location', async () => {
    await service.create('brand-1', {
      name: 'Second location',
      countryCode: 'by',
      currency: 'byn',
      timezone: 'Europe/Minsk',
    });

    expect(db.location.create).toHaveBeenCalledWith({
      data: {
        brandId: 'brand-1',
        name: 'Second location',
        countryCode: 'BY',
        currency: 'BYN',
        timezone: 'Europe/Minsk',
      },
    });
    expect(epoch.bumpMany).toHaveBeenCalledWith(['user-1']);
  });

  it.each([
    { countryCode: 'ZZ' },
    { currency: 'USD' },
    { timezone: 'America/New_York' },
  ])('rejects an invalid location before writing: %j', async (overrides) => {
    await expect(
      service.create('brand-1', { ...location, ...overrides }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.location.create).not.toHaveBeenCalled();
    expect(epoch.bumpMany).not.toHaveBeenCalled();
  });

  it.each([BusinessType.BARBERSHOP, null])(
    'allows changing or clearing the business type: %s',
    async (businessType) => {
      db.location.update.mockResolvedValueOnce({ ...location, businessType });

      const result = await service.update(
        'location-1',
        { businessType },
        { businessType },
      );

      expect(db.location.update).toHaveBeenCalledWith({
        where: { id: 'location-1' },
        data: { businessType },
      });
      expect(result).toMatchObject({
        businessType,
        countryCode: 'BY',
        currency: 'BYN',
        timezone: 'Europe/Minsk',
      });
    },
  );
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessType } from '@prisma/client';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { BrandService } from './brand.service.js';

describe('BrandService first location', () => {
  const db = {
    $transaction: vi.fn(),
    brand: {
      create: vi
        .fn()
        .mockResolvedValue({ id: 'brand-1', locations: [{ staff: [] }] }),
      updateMany: vi.fn(),
      delete: vi.fn(),
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
  const bookingDeletionPolicy = { assertBrandDeletionAllowed: vi.fn() };
  const access = { assignInitialOwner: vi.fn() };
  const service = new BrandService(
    db as never,
    users as never,
    { emit: vi.fn() } as never,
    epoch as never,
    bookingDeletionPolicy as never,
    access as never,
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

  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation((callback) => callback(db));
  });

  it('soft-deletes a brand without deleting its locations or memberships', async () => {
    db.brand.updateMany.mockResolvedValue({ count: 1 });
    await service.delete('brand-1');
    expect(db.brand.updateMany).toHaveBeenCalledWith({
      where: { id: 'brand-1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(db.brand.delete).not.toHaveBeenCalled();
    expect(
      bookingDeletionPolicy.assertBrandDeletionAllowed,
    ).toHaveBeenCalledWith('brand-1', db);
  });

  it('returns not found when the brand is already deleted', async () => {
    db.brand.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.delete('brand-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      bookingDeletionPolicy.assertBrandDeletionAllowed,
    ).not.toHaveBeenCalled();
  });

  it('creates the first location with normalized locale, business type and owner access', async () => {
    await service.create('user-1', dto, actor);

    expect(db.brand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locations: {
            create: expect.objectContaining({
              countryCode: 'BY',
              currency: 'BYN',
              timezone: 'Europe/Minsk',
              businessType: BusinessType.BEAUTY_SALON,
            }),
          },
        }),
      }),
    );
    expect(access.assignInitialOwner).toHaveBeenCalledWith(
      'brand-1',
      'user-1',
      db,
    );
    expect(epoch.bump).toHaveBeenCalled();
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

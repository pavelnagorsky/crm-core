import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessType } from '@prisma/client';
import { BrandService } from './brand.service.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';

describe('BrandService first location', () => {
  const db = {
    $transaction: vi.fn(),
    brand: {
      create: vi.fn().mockResolvedValue({
        id: 'brand-1',
        name: 'Brand',
        locations: [{ id: 'location-1', name: 'First location' }],
      }),
      updateMany: vi.fn(),
      delete: vi.fn(),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: 'brand-1', name: 'Brand' }),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const epoch = { bump: vi.fn() };
  const bookingDeletionPolicy = { assertBrandDeletionAllowed: vi.fn() };
  const access = { assignInitialOwner: vi.fn() };
  const events = { emit: vi.fn() };
  const actor = { id: 'user-1', name: 'Anna', role: AuditActorRole.OWNER };
  const service = new BrandService(
    db as never,
    events as never,
    epoch as never,
    bookingDeletionPolicy as never,
    access as never,
    { invalidate: vi.fn() } as never,
  );
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
    await service.delete('brand-1', actor);
    expect(db.brand.updateMany).toHaveBeenCalledWith({
      where: { id: 'brand-1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(db.brand.delete).not.toHaveBeenCalled();
    expect(
      bookingDeletionPolicy.assertBrandDeletionAllowed,
    ).toHaveBeenCalledWith('brand-1', db);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand-1',
        entityType: 'BRAND',
        entityId: 'brand-1',
        eventType: AuditEvent.BRAND_DELETED,
        actionType: 'DELETE',
        actor,
        payload: { name: 'Brand' },
      }),
    );
  });

  it('returns not found when the brand is already deleted', async () => {
    db.brand.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.delete('brand-1', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      bookingDeletionPolicy.assertBrandDeletionAllowed,
    ).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
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
    expect(
      db.brand.create.mock.calls[0][0].data.locations.create,
    ).not.toHaveProperty('staff');
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand-1',
        entityType: 'BRAND',
        entityId: 'brand-1',
        eventType: AuditEvent.BRAND_CREATED,
        actor,
        payload: { name: 'Brand' },
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand-1',
        locationId: 'location-1',
        entityType: 'LOCATION',
        entityId: 'location-1',
        eventType: AuditEvent.LOCATION_CREATED,
        actor,
        payload: { name: 'First location' },
      }),
    );
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
          {
            ...dto,
            location: { ...dto.location, ...overrides },
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(db.brand.create).not.toHaveBeenCalled();
      expect(epoch.bump).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    },
  );

  it('does not log creation when the transaction rolls back', async () => {
    access.assignInitialOwner.mockRejectedValueOnce(
      new Error('Membership failed'),
    );
    await expect(service.create('user-1', dto, actor)).rejects.toThrow(
      'Membership failed',
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not log deletion when open bookings block it', async () => {
    db.brand.updateMany.mockResolvedValue({ count: 1 });
    bookingDeletionPolicy.assertBrandDeletionAllowed.mockRejectedValueOnce(
      new Error('Open bookings'),
    );
    await expect(service.delete('brand-1', actor)).rejects.toThrow(
      'Open bookings',
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('logs a logo change even when the brand name is unchanged', async () => {
    db.brand.findUnique.mockResolvedValue({
      id: 'brand-1',
      name: 'Brand',
      logoFileId: null,
    });
    db.brand.update.mockResolvedValue({
      id: 'brand-1',
      name: 'Brand',
      logoFileId: 'logo-1',
    });
    await service.update('brand-1', { logoFileId: 'logo-1' }, actor);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: AuditEvent.BRAND_UPDATED,
        actor,
        payload: {
          changes: [
            expect.objectContaining({ field: 'logoFileId', to: 'logo-1' }),
          ],
        },
      }),
    );
  });
});

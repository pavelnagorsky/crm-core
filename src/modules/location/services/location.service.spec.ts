import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { BusinessType } from '@prisma/client';
import { CreateLocationDto } from '../dto/create-location.dto.js';
import { UpdateLocationDto } from '../dto/update-location.dto.js';
import { LocationService } from './location.service.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';

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
    $transaction: vi.fn(),
    location: {
      create: vi.fn().mockResolvedValue(location),
      findUnique: vi.fn().mockResolvedValue(location),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue(location),
    },
  };
  const brands = {
    findById: vi.fn().mockResolvedValue({ id: 'brand-1' }),
    findMemberUserIds: vi.fn().mockResolvedValue(['user-1']),
  };
  const epoch = { bumpMany: vi.fn() };
  const bookingDeletionPolicy = { assertLocationDeletionAllowed: vi.fn() };
  const events = { emit: vi.fn() };
  const actor = { id: 'user-1', name: 'Anna', role: AuditActorRole.OWNER };
  const service = new LocationService(
    db as never,
    brands as never,
    epoch as never,
    bookingDeletionPolicy as never,
    { invalidate: vi.fn() } as never,
    events as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation((callback) => callback(db));
    db.location.update.mockImplementation(async ({ data }) => ({
      ...location,
      ...data,
    }));
  });

  it('preserves stored contacts when an older client omits them', async () => {
    const stored = {
      ...location,
      phone: '+375292332000',
      instagram: '@studio',
      telegram: 'studio',
      whatsapp: '+375292332000',
      website: 'https://example.com',
      mapWidgetUrl: 'https://yandex.ru/map-widget/v1/',
    };
    db.location.update.mockImplementationOnce(async ({ data }) => ({
      ...stored,
      ...Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ),
    }));
    const dto = await new ValidationPipe({
      transform: true,
      whitelist: true,
    }).transform(
      { name: 'Renamed' },
      { type: 'body', metatype: UpdateLocationDto },
    );
    const result = await service.update(
      'location-1',
      dto,
      { name: 'Renamed' },
      actor,
    );
    expect(result).toEqual({ ...stored, name: 'Renamed' });
    const data = db.location.update.mock.calls[0][0].data;
    for (const field of [
      'phone',
      'instagram',
      'telegram',
      'whatsapp',
      'website',
      'mapWidgetUrl',
    ]) {
      expect(data[field]).toBeUndefined();
    }
  });

  it.each([null, ''])(
    'persists explicit clearing with %j as null',
    async (value) => {
      const fields = [
        'phone',
        'instagram',
        'telegram',
        'whatsapp',
        'website',
        'mapWidgetUrl',
      ];
      const raw = Object.fromEntries(fields.map((field) => [field, value]));
      const dto = await new ValidationPipe({
        transform: true,
        whitelist: true,
      }).transform(raw, { type: 'body', metatype: UpdateLocationDto });
      await service.update('location-1', dto, raw, actor);
      expect(db.location.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining(
            Object.fromEntries(fields.map((field) => [field, null])),
          ),
        }),
      );
    },
  );

  it('persists normalized contacts during creation', async () => {
    const dto = await new ValidationPipe({
      transform: true,
      whitelist: true,
    }).transform(
      {
        ...location,
        phone: '+375292332000',
        instagram: ' @studio ',
        telegram: 'studio',
        whatsapp: '',
        website: ' https://example.com ',
        mapWidgetUrl:
          '<iframe src="https://yandex.ru/map-widget/v1/"></iframe>',
      },
      { type: 'body', metatype: CreateLocationDto },
    );
    await service.create('brand-1', dto, actor);
    expect(db.location.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: '+375292332000',
        instagram: '@studio',
        telegram: 'studio',
        whatsapp: null,
        website: 'https://example.com',
        mapWidgetUrl: 'https://yandex.ru/map-widget/v1/',
      }),
    });
  });

  it('soft-deletes only the location while preserving related data', async () => {
    db.location.updateMany.mockResolvedValue({ count: 1 });
    await service.delete('location-1', actor);
    expect(db.location.updateMany).toHaveBeenCalledWith({
      where: { id: 'location-1', deletedAt: null, brand: { deletedAt: null } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(db.location.delete).not.toHaveBeenCalled();
    expect(
      bookingDeletionPolicy.assertLocationDeletionAllowed,
    ).toHaveBeenCalledWith('location-1', db);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand-1',
        locationId: 'location-1',
        entityType: 'LOCATION',
        entityId: 'location-1',
        eventType: AuditEvent.LOCATION_DELETED,
        actor,
        payload: { name: 'Location' },
      }),
    );
  });

  it('does not allow deleting a location under a deleted brand', async () => {
    db.location.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.delete('location-1', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      bookingDeletionPolicy.assertLocationDeletionAllowed,
    ).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('normalizes the locale when creating another location', async () => {
    await service.create(
      'brand-1',
      {
        name: 'Second location',
        countryCode: 'by',
        currency: 'byn',
        timezone: 'Europe/Minsk',
      },
      actor,
    );

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
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand-1',
        locationId: 'location-1',
        eventType: AuditEvent.LOCATION_CREATED,
        actor,
        payload: { name: 'Location' },
      }),
    );
  });

  it.each([
    { countryCode: 'ZZ' },
    { currency: 'USD' },
    { timezone: 'America/New_York' },
  ])('rejects an invalid location before writing: %j', async (overrides) => {
    await expect(
      service.create('brand-1', { ...location, ...overrides }, actor),
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
        actor,
      );

      expect(db.location.update).toHaveBeenCalledWith({
        where: {
          id: 'location-1',
          deletedAt: null,
          brand: { deletedAt: null },
        },
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

  it('does not log deletion when its transaction fails', async () => {
    db.location.updateMany.mockResolvedValue({ count: 1 });
    bookingDeletionPolicy.assertLocationDeletionAllowed.mockRejectedValueOnce(
      new Error('Open bookings'),
    );
    await expect(service.delete('location-1', actor)).rejects.toThrow(
      'Open bookings',
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('logs contact, business type and booking settings changes', async () => {
    const dto = {
      phone: null,
      businessType: null,
      slotIntervalMinutes: 15,
      isBookingConfirmationRequired: true,
    };
    db.location.findUnique.mockResolvedValueOnce({
      ...location,
      phone: '+375291234567',
      slotIntervalMinutes: 30,
      isBookingConfirmationRequired: false,
    });
    await service.update('location-1', dto, dto, actor);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand-1',
        locationId: 'location-1',
        eventType: AuditEvent.LOCATION_UPDATED,
        actionType: 'MODIFY',
        actor,
        payload: {
          changes: expect.arrayContaining([
            expect.objectContaining({ field: 'phone', from: '+375291234567' }),
            expect.objectContaining({
              field: 'businessType',
              from: BusinessType.BEAUTY_SALON,
            }),
            { field: 'slotIntervalMinutes', from: '30', to: '15' },
            {
              field: 'isBookingConfirmationRequired',
              from: 'false',
              to: 'true',
            },
          ]),
        },
      }),
    );
  });

  it('does not emit an update event when no values change', async () => {
    await service.update(
      'location-1',
      { name: location.name },
      { name: location.name },
      actor,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });
});

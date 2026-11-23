import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { createBillingFacadeStub } from '../../billing/testing/billing-facade.stub.js';
import { LocationService } from './location.service.js';

const actor = { id: 'user-1', name: 'Anna', role: AuditActorRole.OWNER };
const stored = (step: string) => ({
  id: 'location-1',
  brandId: 'brand-1',
  name: 'Location',
  priceRoundingStep: new Prisma.Decimal(step),
});

describe('LocationService price rounding step', () => {
  const db = {
    location: { findUnique: vi.fn(), update: vi.fn() },
  };
  const cache = { invalidate: vi.fn() };
  const events = { emit: vi.fn() };
  const service = new LocationService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    cache as never,
    events as never,
    createBillingFacadeStub(),
  );

  beforeEach(() => {
    vi.resetAllMocks();
    db.location.update.mockImplementation(async ({ data }) => ({
      ...stored('1.00'),
      priceRoundingStep: new Prisma.Decimal(data.priceRoundingStep),
    }));
  });

  describe('updatePriceRoundingStep', () => {
    it('stores the step, clears the price cache and audits the change', async () => {
      db.location.findUnique.mockResolvedValue(stored('1.00'));
      const location = await service.updatePriceRoundingStep(
        'location-1',
        '0.50',
        actor,
      );
      expect(db.location.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { priceRoundingStep: '0.50' },
        }),
      );
      expect(location.priceRoundingStep.toFixed(2)).toBe('0.50');
      expect(cache.invalidate).toHaveBeenCalledWith(
        CacheDependency.pricing('location-1'),
      );
      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit.mock.calls[0][1]).toMatchObject({
        brandId: 'brand-1',
        locationId: 'location-1',
        entityType: AuditEntity.LOCATION,
        entityId: 'location-1',
        eventType: AuditEvent.PRICE_ROUNDING_UPDATED,
        actor,
        payload: {
          changes: [{ field: 'priceRoundingStep', from: '1.00', to: '0.50' }],
        },
      });
    });

    it('does not audit a save of the same step but still clears the cache', async () => {
      db.location.findUnique.mockResolvedValue(stored('1.00'));
      await service.updatePriceRoundingStep('location-1', '1.00', actor);
      expect(events.emit).not.toHaveBeenCalled();
      expect(cache.invalidate).toHaveBeenCalled();
    });

    it('answers 404 for an unknown location and writes nothing', async () => {
      db.location.findUnique.mockResolvedValue(null);
      await expect(
        service.updatePriceRoundingStep('location-1', '5.00', actor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.location.update).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('findPriceRoundingStep', () => {
    it('reads the step from the database', async () => {
      db.location.findUnique.mockResolvedValue({
        priceRoundingStep: new Prisma.Decimal('10.00'),
      });
      const step = await service.findPriceRoundingStep('location-1');
      expect(step.toFixed(2)).toBe('10.00');
      expect(db.location.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'location-1' }),
          select: { priceRoundingStep: true },
        }),
      );
    });

    it('answers 404 for an unknown location', async () => {
      db.location.findUnique.mockResolvedValue(null);
      await expect(
        service.findPriceRoundingStep('location-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PublicSlotPricingService } from '../services/public-slot-pricing.service.js';
import { PublicSlotsController } from './public-slots.controller.js';

describe('Public slots (HTTP)', () => {
  let app: INestApplication;
  const locationId = '11111111-1111-4111-8111-111111111111';
  const serviceId = '22222222-2222-4222-8222-222222222222';
  const slots = {
    getSlots: vi.fn(async () => [
      {
        date: '2026-11-10',
        slots: [
          {
            time: '10:00',
            price: new Prisma.Decimal('60'),
            staffIds: ['anna'],
          },
        ],
      },
    ]),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicSlotsController],
      providers: [{ provide: PublicSlotPricingService, useValue: slots }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());

  it('serves the priced slots under the calendar URL without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get(`/locations/${locationId}/calendar/public/available-slots`)
      .query({ serviceId })
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.responseValue).toEqual([
      {
        date: '2026-11-10',
        slots: [{ time: '10:00', price: '60.00', staffIds: ['anna'] }],
      },
    ]);
    expect(slots.getSlots).toHaveBeenCalledWith(
      locationId,
      expect.objectContaining({ serviceId }),
    );
  });

  it('rejects a location id that is not a UUID', async () => {
    await request(app.getHttpServer())
      .get('/locations/not-a-uuid/calendar/public/available-slots')
      .expect(400);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TokenEpochRegistryService } from '../../auth/services/token-epoch-registry.service.js';
import { PublicBookingCreateController } from '../../booking-channels/controllers/public-booking-create.controller.js';
import { BookingChannelAttributionService } from '../../booking-channels/services/booking-channel-attribution.service.js';
import { BookingCreateFacade } from '../booking-create.facade.js';
import { BookingsFacade } from '../bookings.facade.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingsExportService } from '../export/services/bookings-export.service.js';
import { BookingAccessService } from '../services/booking-access.service.js';
import { BookingClientTokenService } from '../services/booking-client-token.service.js';
import { BookingClientService } from '../services/booking-client.service.js';
import { JwtBookingClientStrategy } from '../strategies/jwt-booking-client.strategy.js';
import { booking } from '../testing/factories/booking.factory.js';
import { BookingsController } from './bookings.controller.js';
import { BookingClientController } from './booking-client.controller.js';

describe('Client booking API (HTTP)', () => {
  let app: INestApplication;
  const id = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const jwt = new JwtService();
  const config = new ConfigService({
    jwt: { bookingClientTokenSecret: 'booking-secret' },
    frontend: { domain: 'https://example.test' },
  });
  const tokens = new BookingClientTokenService(jwt, config);
  const bookings = {
    findById: vi.fn(),
    findByIdInLocation: vi.fn(),
  };
  const client = {
    availableSlots: vi.fn(),
    rescheduleByClient: vi.fn(),
    cancelByClient: vi.fn(),
  };
  const create = { createPublicBooking: vi.fn() };
  const current = () =>
    booking({
      id,
      locationId,
      startAt: new Date('2026-10-28T10:00:00Z'),
      endAt: new Date('2026-10-28T11:00:00Z'),
      internalNotes: 'private',
      item: { calendarEventId: 'private-event' },
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [
        BookingsController,
        BookingClientController,
        PublicBookingCreateController,
      ],
      providers: [
        { provide: BookingsFacade, useValue: bookings },
        { provide: BookingCreateFacade, useValue: create },
        { provide: BookingClientTokenService, useValue: tokens },
        { provide: BookingClientService, useValue: client },
        { provide: BookingsExportService, useValue: {} },
        { provide: BookingAccessService, useValue: {} },
        { provide: TokenEpochRegistryService, useValue: {} },
        {
          provide: BookingChannelAttributionService,
          useValue: { resolve: vi.fn().mockResolvedValue({}) },
        },
        {
          provide: JwtBookingClientStrategy,
          useValue: new JwtBookingClientStrategy(config, bookings as never),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z'));
    bookings.findById.mockResolvedValue(current());
    bookings.findByIdInLocation.mockResolvedValue(current());
    client.cancelByClient.mockResolvedValue(current());
    client.rescheduleByClient.mockResolvedValue(current());
    client.availableSlots.mockResolvedValue([]);
    create.createPublicBooking.mockResolvedValue(current());
  });
  afterEach(() => vi.useRealTimers());

  it('returns a usable management link on creation even without email', async () => {
    const { body, headers } = await request(app.getHttpServer())
      .post(`/public/locations/${locationId}/bookings`)
      .send({
        serviceId: id,
        startAt: '2026-10-28T13:00:00',
        firstName: 'Anna',
        phone: '+375291112233',
      })
      .expect(201);
    expect(body.responseValue.id).toBe(id);
    expect(body.responseValue.manageUrl).toBe(
      tokens.managementUrl(body.responseValue.token),
    );
    expect(headers['cache-control']).toBe('no-store');
    await request(app.getHttpServer())
      .get('/public/bookings/me')
      .auth(body.responseValue.token, { type: 'bearer' })
      .expect(200);
  });

  it('returns only client-facing fields and available actions', async () => {
    const { body, headers } = await request(app.getHttpServer())
      .get('/public/bookings/me')
      .auth(tokens.generateClientToken(id), { type: 'bearer' })
      .expect(200);
    expect(body.responseValue).toMatchObject({
      id,
      canCancel: true,
      canReschedule: true,
      accessExpiresAt: '2026-10-31T11:00:00.000Z',
    });
    expect(body.responseValue).not.toHaveProperty('internalNotes');
    expect(body.responseValue).not.toHaveProperty('clientId');
    expect(body.responseValue.items[0]).not.toHaveProperty('calendarEventId');
    expect(headers['cache-control']).toBe('no-store');
    expect(bookings.findById).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('cancels only the authorized booking with a client-supplied reason', async () => {
    await request(app.getHttpServer())
      .post('/public/bookings/me/cancel')
      .auth(tokens.generateClientToken(id), { type: 'bearer' })
      .send({
        reason: 'Changed plans',
        bookingId: 'other',
        cancelledBy: 'STAFF',
      })
      .expect(200);
    expect(client.cancelByClient).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      { reason: 'Changed plans' },
    );
    expect(bookings.findById).toHaveBeenCalledExactlyOnceWith(id);
  });

  it.each(['missing', 'invalid', 'other-secret', 'expired'])(
    'rejects %s tokens on every client endpoint',
    async (kind) => {
      let token = tokens.generateClientToken(id);
      if (kind === 'invalid') token = 'invalid';
      if (kind === 'other-secret')
        token = jwt.sign({ bookingId: id }, { secret: 'access-secret' });
      if (kind === 'expired')
        bookings.findById.mockResolvedValue(
          booking({ id, endAt: new Date('2026-10-20') }),
        );
      for (const path of [
        '/public/bookings/me',
        '/public/bookings/me/available-slots?from=2026-10-28&to=2026-10-29',
        '/public/bookings/me/cancel',
        '/public/bookings/me/reschedule',
      ]) {
        const mutation =
          path.endsWith('/cancel') || path.endsWith('/reschedule');
        let req = mutation
          ? request(app.getHttpServer()).post(path)
          : request(app.getHttpServer()).get(path);
        if (kind !== 'missing') req = req.auth(token, { type: 'bearer' });
        await req.expect(401);
      }
      expect(client.rescheduleByClient).not.toHaveBeenCalled();
      expect(client.cancelByClient).not.toHaveBeenCalled();
    },
  );

  it('takes the booking only from the token and strips staff, price, duration and other-booking inputs', async () => {
    const token = tokens.generateClientToken(id);
    await request(app.getHttpServer())
      .post('/public/bookings/me/reschedule')
      .auth(token, { type: 'bearer' })
      .send({
        bookingId: 'other',
        startAt: '2026-10-29T14:00:00',
        endAt: '2026-10-29T14:01:00',
        staffId: locationId,
        internalNotes: 'overwrite',
        items: [],
      })
      .expect(200);
    expect(client.rescheduleByClient).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      {
        startAt: '2026-10-29T14:00:00',
      },
    );
    await request(app.getHttpServer())
      .get(
        '/public/bookings/me/available-slots?from=2026-10-28&to=2026-10-29&bookingId=other',
      )
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(client.availableSlots).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      {
        from: '2026-10-28',
        to: '2026-10-29',
      },
    );
  });

  it('rejects invalid dates and incomplete reschedule requests', async () => {
    const token = tokens.generateClientToken(id);
    for (const payload of [
      {},
      { startAt: null },
      { startAt: '2026-02-31T10:00:00' },
      { startAt: '2026-10-29T14:00:00Z' },
    ]) {
      await request(app.getHttpServer())
        .post('/public/bookings/me/reschedule')
        .auth(token, { type: 'bearer' })
        .send(payload)
        .expect(400);
    }
    expect(client.rescheduleByClient).not.toHaveBeenCalled();
  });

  it('accepts only calendar dates for the slot range', async () => {
    const token = tokens.generateClientToken(id);
    await request(app.getHttpServer())
      .get(
        '/public/bookings/me/available-slots?from=2026-10-28T00:00:00Z&to=2026-10-29',
      )
      .auth(token, { type: 'bearer' })
      .expect(400);
    expect(client.availableSlots).not.toHaveBeenCalled();
  });

  it('keeps cancelled bookings readable with both actions disabled', async () => {
    bookings.findById.mockResolvedValue({
      ...current(),
      status: BookingStatus.CANCELLED,
    });
    const { body } = await request(app.getHttpServer())
      .get('/public/bookings/me')
      .auth(tokens.generateClientToken(id), { type: 'bearer' })
      .expect(200);
    expect(body.responseValue).toMatchObject({
      canCancel: false,
      canReschedule: false,
    });
  });

  it('issues a complete manager link only after checking its location', async () => {
    const controller = app.get(BookingsController);
    const response = await controller.generateClientToken(locationId, id);
    expect(bookings.findByIdInLocation).toHaveBeenCalledWith(locationId, id);
    expect(response.responseValue?.manageUrl).toBe(
      tokens.managementUrl(response.responseValue!.token),
    );
  });
});

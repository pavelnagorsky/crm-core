import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { BusinessType, UserRole } from '@prisma/client';
import request from 'supertest';
import { PERMISSIONS_VERSION } from '../../access/constants/permissions-version.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { TokenEpochRegistryService } from '../../auth/services/token-epoch-registry.service.js';
import { JwtAccessStrategy } from '../../auth/strategies/jwt-access.strategy.js';
import { LocationService } from '../services/location.service.js';
import { LocationController } from './location.controller.js';

describe('Location reference endpoints (HTTP)', () => {
  let app: INestApplication;
  const secret = 'location-reference-test-secret';
  const epoch = { get: vi.fn().mockResolvedValue(0) };
  const locations = { findById: vi.fn() };
  const token = new JwtService().sign(
    {
      sub: 'user-without-a-brand',
      role: UserRole.USER,
      brandMemberships: [],
      locationMemberships: [],
      tokenEpoch: 0,
      permissions: {},
      permissionsVersion: PERMISSIONS_VERSION,
    },
    { secret, expiresIn: '1h' },
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [LocationController],
      providers: [
        { provide: LocationService, useValue: locations },
        {
          provide: JwtAccessStrategy,
          useValue: new JwtAccessStrategy({
            get: () => ({ accessTokenSecret: secret }),
          } as never),
        },
      ],
    })
      .overrideGuard(TokenEpochGuard)
      .useValue(
        new TokenEpochGuard(epoch as unknown as TokenEpochRegistryService),
      )
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    epoch.get.mockResolvedValue(0);
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['/locations/options', '/locations/business-types'])(
    'requires authentication for %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    },
  );

  it('returns geography without requiring a brand or routing options as a location ID', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/locations/options')
      .auth(token, { type: 'bearer' })
      .expect(200);

    expect(body.isSuccess).toBe(true);
    expect(body.responseValue).not.toHaveProperty('businessTypes');
    expect(
      body.responseValue.countries.map(
        (country: { countryCode: string }) => country.countryCode,
      ),
    ).toEqual(['BY', 'RU', 'KZ']);
    expect(body.responseValue.countries).toContainEqual({
      countryCode: 'BY',
      currency: 'BYN',
      timezones: ['Europe/Minsk'],
      defaultTimezone: 'Europe/Minsk',
    });
    expect(locations.findById).not.toHaveBeenCalled();
  });

  it('returns business types separately for a user without a brand', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/locations/business-types')
      .auth(token, { type: 'bearer' })
      .expect(200);

    expect(body.isSuccess).toBe(true);
    expect(body.responseValue).toEqual({
      businessTypes: Object.values(BusinessType),
    });
    expect(locations.findById).not.toHaveBeenCalled();
  });

  it.each(['/locations/options', '/locations/business-types'])(
    'rejects a stale token for %s',
    async (path) => {
      epoch.get.mockResolvedValue(1);
      await request(app.getHttpServer())
        .get(path)
        .auth(token, { type: 'bearer' })
        .expect(409);
    },
  );
});

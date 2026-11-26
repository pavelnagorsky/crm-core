import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service.js';
import { AccessService } from '../access/services/access.service.js';
import { PricingFacade } from '../pricing/pricing.facade.js';
import { AuditService } from './services/audit.service.js';

/**
 * The configuration is read when AppModule is imported, so the secrets the providers require are set
 * first and AppModule is imported afterwards. CI has no .env: the test must not depend on one.
 */
const REQUIRED_ENV = {
  ACCESS_TOKEN_SECRET: 'test-access-secret',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret',
  EMAIL_TOKEN_SECRET: 'test-email-secret',
  BOOKING_CLIENT_TOKEN_SECRET: 'test-booking-client-secret',
  DOMAIN: 'https://klendo.test',
};

describe('Audit module dependencies', () => {
  beforeAll(() => {
    for (const [name, value] of Object.entries(REQUIRED_ENV)) {
      if (!process.env[name]) vi.stubEnv(name, value);
    }
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  // The whole application is imported inside the test, so it needs more than the default 5 s.
  it(
    'resolves access, audit and pricing providers in the application without connecting to a database',
    { timeout: 60_000 },
    async () => {
      const { AppModule } = await import('../../app.module.js');
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DatabaseService)
        .useValue({})
        .compile();
      try {
        expect(module.get(AccessService)).toBeInstanceOf(AccessService);
        expect(module.get(AuditService)).toBeInstanceOf(AuditService);
        expect(module.get(PricingFacade)).toBeInstanceOf(PricingFacade);
      } finally {
        await module.close();
      }
    },
  );
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { CertificateFormat } from 'google-auth-library/build/src/auth/oauth2client.js';
import request from 'supertest';
import { GlobalExceptionFilter } from '../../../shared/filters/exception.filter.js';
import { exceptionFactory } from '../../../shared/validation/exception-factory.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';
import { AuthService } from '../services/auth.service.js';
import { GoogleOAuthStrategy } from '../strategies/google.strategy.js';
import { AuthController } from './auth.controller.js';

describe('Google sign-in (HTTP)', () => {
  let app: INestApplication;
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const auth = { handleOAuth: vi.fn() };
  const googleConfig = {
    clientId: 'test-client.apps.googleusercontent.com',
    clientSecret: 'test-secret',
  };
  const config = new ConfigService({ googleCloud: googleConfig });

  function credential(overrides: Record<string, unknown> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: googleConfig.clientId,
        sub: 'google-user-1',
        email: 'anna@gmail.com',
        email_verified: true,
        iat: now,
        exp: now + 3600,
        ...overrides,
      }),
    ).toString('base64url');
    const content = `${header}.${payload}`;
    return `${content}.${sign('RSA-SHA256', Buffer.from(content), keys.privateKey).toString('base64url')}`;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: GoogleOAuthStrategy,
          useValue: new GoogleOAuthStrategy(config),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        exceptionFactory,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    auth.handleOAuth.mockReset().mockResolvedValue({
      accessToken: 'app-access-token',
      refreshToken: 'app-refresh-token',
    });
    config.set('googleCloud', { ...googleConfig });
    vi.spyOn(
      OAuth2Client.prototype,
      'getFederatedSignonCertsAsync',
    ).mockResolvedValue({
      certs: {
        'test-key': keys.publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      },
      format: CertificateFormat.PEM,
    });
    vi.spyOn(OAuth2Client.prototype, 'getToken').mockImplementation(
      async () => ({
        tokens: { id_token: credential() },
        res: null,
      }),
    );
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());

  it.each(['oauth', 'one-tap', undefined])(
    'creates an application session through the Google guard: %s',
    async (type) => {
      const body =
        type === 'one-tap'
          ? { type, oneTapCode: credential() }
          : { type, authCode: 'authorization-code' };
      const response = await request(app.getHttpServer())
        .post('/auth/google')
        .set('User-Agent', 'test-browser')
        .send(body)
        .expect(201);

      expect(auth.handleOAuth).toHaveBeenCalledExactlyOnceWith(
        {
          providerId: 'google-user-1',
          providerType: OAuthProviderEnum.Google,
          email: 'anna@gmail.com',
        },
        'test-browser',
      );
      expect(response.body).toMatchObject({
        isSuccess: true,
        responseValue: { accessToken: 'app-access-token' },
      });
      expect(response.body.responseValue).not.toHaveProperty('refreshToken');
      expect(response.headers['set-cookie']).toEqual([
        expect.stringContaining('app-refresh-token'),
      ]);
      expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(response.headers['set-cookie'][0]).toContain('Secure');
      if (type === 'one-tap') {
        expect(OAuth2Client.prototype.getToken).not.toHaveBeenCalled();
      } else {
        expect(OAuth2Client.prototype.getToken).toHaveBeenCalledExactlyOnceWith(
          {
            code: 'authorization-code',
            redirect_uri: 'postmessage',
          },
        );
      }
    },
  );

  it.each([
    { body: {} },
    { body: { type: 'invalid', authCode: 'code' } },
    { body: { type: null, authCode: 'code' } },
    { body: { type: 'oauth', authCode: '' } },
    { body: { type: 'oauth', authCode: 123 } },
    { body: { type: 'one-tap', authCode: 'code' } },
    { body: { type: 'one-tap', oneTapCode: '' } },
    { body: { type: 'one-tap', oneTapCode: null } },
    { body: { type: 'one-tap', oneTapCode: 123 } },
    { body: [] },
  ])(
    'rejects malformed input before calling Google: $body',
    async ({ body }) => {
      await request(app.getHttpServer())
        .post('/auth/google')
        .send(body)
        .expect(400);
      expect(OAuth2Client.prototype.getToken).not.toHaveBeenCalled();
      expect(
        OAuth2Client.prototype.getFederatedSignonCertsAsync,
      ).not.toHaveBeenCalled();
      expect(auth.handleOAuth).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: 'wrong audience', claims: { aud: 'another-client' } },
    { name: 'wrong issuer', claims: { iss: 'https://attacker.example' } },
    {
      name: 'expired token',
      claims: { exp: Math.floor(Date.now() / 1000) - 3600 },
    },
    { name: 'unverified email', claims: { email_verified: false } },
    { name: 'missing email', claims: { email: undefined } },
    { name: 'missing subject', claims: { sub: undefined } },
  ])(
    'rejects invalid identity claims in both flows: $name',
    async ({ claims }) => {
      const token = credential(claims);
      vi.mocked(OAuth2Client.prototype.getToken).mockImplementation(
        async () => ({
          tokens: { id_token: token },
          res: null,
        }),
      );
      for (const body of [
        { type: 'one-tap', oneTapCode: token },
        { type: 'oauth', authCode: 'authorization-code' },
      ]) {
        const response = await request(app.getHttpServer())
          .post('/auth/google')
          .send(body)
          .expect(401);
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      expect(auth.handleOAuth).not.toHaveBeenCalled();
    },
  );

  it('rejects a tampered ID token signature', async () => {
    const token = credential();
    const segments = token.split('.');
    segments[2] = Buffer.alloc(256).toString('base64url');
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ type: 'one-tap', oneTapCode: segments.join('.') })
      .expect(401);
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });

  it('rejects form submissions to prevent cross-site login requests', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .type('form')
      .send({ type: 'one-tap', oneTapCode: credential() })
      .expect(400);
    expect(auth.handleOAuth).not.toHaveBeenCalled();
    expect(
      OAuth2Client.prototype.getFederatedSignonCertsAsync,
    ).not.toHaveBeenCalled();
  });

  it('accepts One Tap without a client secret', async () => {
    config.set('googleCloud', { ...googleConfig, clientSecret: '' });
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ type: 'one-tap', oneTapCode: credential() })
      .expect(201);
    expect(OAuth2Client.prototype.getToken).not.toHaveBeenCalled();
  });

  it('requires a client secret for the code exchange', async () => {
    config.set('googleCloud', { ...googleConfig, clientSecret: '' });
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ authCode: 'authorization-code' })
      .expect(401);
    expect(OAuth2Client.prototype.getToken).not.toHaveBeenCalled();
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });

  it('rejects an exchange without an ID token', async () => {
    vi.mocked(OAuth2Client.prototype.getToken).mockImplementation(async () => ({
      tokens: { access_token: 'google-access-token' },
      res: null,
    }));
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ authCode: 'authorization-code' })
      .expect(401);
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });

  it('does not disclose Google exchange errors', async () => {
    vi.mocked(OAuth2Client.prototype.getToken).mockRejectedValue(
      new Error('private upstream error'),
    );
    const response = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ authCode: 'authorization-code' })
      .expect(401);
    expect(JSON.stringify(response.body)).not.toContain(
      'private upstream error',
    );
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });

  it('requires a configured audience for One Tap', async () => {
    config.set('googleCloud', { ...googleConfig, clientId: '' });
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ type: 'one-tap', oneTapCode: credential() })
      .expect(401);
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });
});

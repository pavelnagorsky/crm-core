import { HttpService } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import axios, { InternalAxiosRequestConfig } from 'axios';
import request from 'supertest';
import { GlobalExceptionFilter } from '../../../shared/filters/exception.filter.js';
import { exceptionFactory } from '../../../shared/validation/exception-factory.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';
import { AuthService } from '../services/auth.service.js';
import { VkOAuthStrategy } from '../strategies/vk.strategy.js';
import { YandexOAuthStrategy } from '../strategies/yandex.strategy.js';
import { AuthController } from './auth.controller.js';

describe('Yandex and VK sign-in (HTTP)', () => {
  let app: INestApplication;
  const auth = { handleOAuth: vi.fn() };
  const config = new ConfigService();
  const responses = new Map<string, unknown>();
  const upstream = vi.fn(async (httpConfig: InternalAxiosRequestConfig) => {
    if (!responses.has(httpConfig.url!))
      throw new Error('Unexpected OAuth URL');
    return {
      data: responses.get(httpConfig.url!),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: httpConfig,
    };
  });
  const http = new HttpService(axios.create({ adapter: upstream }));
  const requests = {
    yandex: { authCode: 'yandex-code' },
    vk: { authCode: 'vk-code', state: 'vk-state', deviceId: 'vk-device' },
  };
  const tokenUrls = {
    yandex: 'https://oauth.yandex.ru/token',
    vk: 'https://id.vk.com/oauth2/auth',
  };
  const profileUrls = {
    yandex: 'https://login.yandex.ru/info',
    vk: 'https://id.vk.com/oauth2/user_info',
  };
  const providers = ['yandex', 'vk'] as const;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: VkOAuthStrategy,
          useValue: new VkOAuthStrategy(config, http),
        },
        {
          provide: YandexOAuthStrategy,
          useValue: new YandexOAuthStrategy(config, http),
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
    upstream.mockClear();
    auth.handleOAuth.mockReset().mockResolvedValue({
      accessToken: 'app-access-token',
      refreshToken: 'app-refresh-token',
    });
    config.set('yandexCloud', {
      clientId: 'yandex-client',
      clientSecret: 'yandex-secret',
    });
    config.set('vk', {
      clientId: 'vk-client',
      codeVerifier: 'vk-code-verifier',
    });
    config.set('frontend', { domain: 'https://crm.example.com' });
    responses.clear();
    responses.set(tokenUrls.yandex, { access_token: 'yandex-access-token' });
    responses.set(profileUrls.yandex, {
      id: 'yandex-user',
      default_email: 'anna@yandex.ru',
    });
    responses.set(tokenUrls.vk, {
      access_token: 'vk-access-token',
      user_id: 123,
      state: 'vk-state',
    });
    responses.set(profileUrls.vk, {
      user: { user_id: '123', email: 'anna@vk.com' },
    });
  });

  afterAll(async () => app?.close());

  it.each(providers)(
    'creates a CRM session through the %s guard',
    async (provider) => {
      const response = await request(app.getHttpServer())
        .post(`/auth/${provider}`)
        .set('User-Agent', 'test-browser')
        .send(requests[provider])
        .expect(201);
      expect(auth.handleOAuth).toHaveBeenCalledExactlyOnceWith(
        {
          providerType:
            provider === 'vk' ? OAuthProviderEnum.VK : OAuthProviderEnum.Yandex,
          providerId: provider === 'vk' ? '123' : 'yandex-user',
          email: provider === 'vk' ? 'anna@vk.com' : 'anna@yandex.ru',
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

      expect(upstream).toHaveBeenCalledTimes(2);
      const [exchange] = upstream.mock.calls[0];
      const [profile] = upstream.mock.calls[1];
      expect(exchange.url).toBe(tokenUrls[provider]);
      expect(exchange.method).toBe('post');
      expect(exchange.headers.get('Content-Type')).toBe(
        'application/x-www-form-urlencoded',
      );
      expect(profile.url).toBe(profileUrls[provider]);
      if (provider === 'yandex') {
        expect(Object.fromEntries(new URLSearchParams(exchange.data))).toEqual({
          grant_type: 'authorization_code',
          code: requests.yandex.authCode,
        });
        expect(exchange.headers.get('Authorization')).toBe(
          `Basic ${Buffer.from('yandex-client:yandex-secret').toString('base64')}`,
        );
        expect(profile.method).toBe('get');
        expect(profile.headers.get('Authorization')).toBe(
          'OAuth yandex-access-token',
        );
      } else {
        expect(Object.fromEntries(new URLSearchParams(exchange.data))).toEqual({
          grant_type: 'authorization_code',
          code: requests.vk.authCode,
          client_id: 'vk-client',
          device_id: requests.vk.deviceId,
          state: requests.vk.state,
          code_verifier: 'vk-code-verifier',
          redirect_uri: 'https://crm.example.com/auth/oauth/callback',
        });
        expect(profile.method).toBe('post');
        expect(Object.fromEntries(new URLSearchParams(profile.data))).toEqual({
          client_id: 'vk-client',
          access_token: 'vk-access-token',
        });
        expect(profile.headers.get('Content-Type')).toBe(
          'application/x-www-form-urlencoded',
        );
      }
    },
  );

  describe.each(providers)('%s errors', (provider) => {
    it.each([
      { name: 'empty body', body: {} },
      { name: 'empty code', body: { authCode: '' } },
      { name: 'non-string code', body: { authCode: 123 } },
      { name: 'null code', body: { authCode: null } },
      { name: 'array', body: [] },
    ])('rejects $name before contacting the provider', async ({ body }) => {
      const response = await request(app.getHttpServer())
        .post(`/auth/${provider}`)
        .send(body)
        .expect(400);
      expect(upstream).not.toHaveBeenCalled();
      expect(auth.handleOAuth).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('rejects form submissions', async () => {
      await request(app.getHttpServer())
        .post(`/auth/${provider}`)
        .type('form')
        .send(requests[provider])
        .expect(400);
      expect(upstream).not.toHaveBeenCalled();
      expect(auth.handleOAuth).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'provider error',
        tokens: {
          error: 'invalid_grant',
          error_description: 'private upstream details',
        },
      },
      { name: 'missing access token', tokens: {} },
      { name: 'empty access token', tokens: { access_token: '' } },
      { name: 'missing response', tokens: null },
    ])('rejects $name without fetching a profile', async ({ tokens }) => {
      responses.set(tokenUrls[provider], tokens);
      const response = await request(app.getHttpServer())
        .post(`/auth/${provider}`)
        .send(requests[provider])
        .expect(401);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(auth.handleOAuth).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(
        'private upstream details',
      );
    });

    it.each([
      {
        name: 'missing email',
        profile: provider === 'vk' ? { user: {} } : { id: 'yandex-user' },
      },
      {
        name: 'invalid email',
        profile:
          provider === 'vk'
            ? { user: { email: 'invalid' } }
            : { id: 'yandex-user', default_email: 'invalid' },
      },
      { name: 'missing profile', profile: null },
      { name: 'provider error', profile: { error: 'access_denied' } },
    ])('rejects $name from the profile endpoint', async ({ profile }) => {
      responses.set(profileUrls[provider], profile);
      const response = await request(app.getHttpServer())
        .post(`/auth/${provider}`)
        .send(requests[provider])
        .expect(401);
      expect(auth.handleOAuth).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('does not expose network errors or create a session', async () => {
      upstream.mockRejectedValueOnce(new Error('private upstream details'));
      const response = await request(app.getHttpServer())
        .post(`/auth/${provider}`)
        .send(requests[provider])
        .expect(401);
      expect(JSON.stringify(response.body)).not.toContain(
        'private upstream details',
      );
      expect(auth.handleOAuth).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  it.each(['state', 'deviceId'] as const)('requires VK %s', async (field) => {
    await request(app.getHttpServer())
      .post('/auth/vk')
      .send({ ...requests.vk, [field]: '' })
      .expect(400);
    expect(upstream).not.toHaveBeenCalled();
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'mismatched state',
      tokens: { state: 'other-state', user_id: 123 },
    },
    { name: 'missing state', tokens: { user_id: 123 } },
    { name: 'missing user id', tokens: { state: 'vk-state' } },
    { name: 'invalid user id', tokens: { state: 'vk-state', user_id: 0 } },
  ])('rejects VK $name before fetching a profile', async ({ tokens }) => {
    responses.set(tokenUrls.vk, { access_token: 'vk-access-token', ...tokens });
    await request(app.getHttpServer())
      .post('/auth/vk')
      .send(requests.vk)
      .expect(401);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });

  it('rejects a VK profile for another user', async () => {
    responses.set(profileUrls.vk, {
      user: { user_id: '456', email: 'anna@vk.com' },
    });
    await request(app.getHttpServer())
      .post('/auth/vk')
      .send(requests.vk)
      .expect(401);
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });

  it('requires the Yandex user id', async () => {
    responses.set(profileUrls.yandex, { default_email: 'anna@yandex.ru' });
    await request(app.getHttpServer())
      .post('/auth/yandex')
      .send(requests.yandex)
      .expect(401);
    expect(auth.handleOAuth).not.toHaveBeenCalled();
  });

  it.each([
    {
      provider: 'yandex',
      section: 'yandexCloud',
      value: { clientId: 'yandex-client' },
    },
    {
      provider: 'yandex',
      section: 'yandexCloud',
      value: { clientSecret: 'yandex-secret' },
    },
    { provider: 'vk', section: 'vk', value: { clientId: 'vk-client' } },
    {
      provider: 'vk',
      section: 'vk',
      value: { codeVerifier: 'vk-code-verifier' },
    },
    { provider: 'vk', section: 'frontend', value: {} },
  ] as const)(
    'requires configured $section credentials: $value',
    async ({ provider, section, value }) => {
      config.set(section, value);
      await request(app.getHttpServer())
        .post(`/auth/${provider}`)
        .send(requests[provider])
        .expect(401);
      expect(upstream).not.toHaveBeenCalled();
      expect(auth.handleOAuth).not.toHaveBeenCalled();
    },
  );
});

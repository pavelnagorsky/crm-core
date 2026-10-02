export default () => {
  return {
    port: parseInt(process.env.PORT ?? '', 10) || 3000,
    googleCloud: {
      projectId: process.env['GOOGLE_PROJECT_ID'],
      apiKey: process.env['GOOGLE_API_KEY'],
      bucketName: process.env['GOOGLE_BUCKET_NAME'],
      clientId: process.env['GOOGLE_CLOUD_CLIENT_ID'],
      clientSecret: process.env['GOOGLE_CLOUD_CLIENT_SECRET'],
    },
    yandexCloud: {
      apiKey: process.env['YANDEX_API_KEY'],
      clientId: process.env['YANDEX_CLIENT_ID'],
      clientSecret: process.env['YANDEX_CLIENT_SECRET'],
    },
    vk: {
      clientId: process.env['VK_CLIENT_ID'],
      codeVerifier: process.env['VK_CODE_VERIFIER'],
    },
    database: {
      url: process.env['DATABASE_URL'],
    },
    jwt: {
      accessTokenSecret: process.env['ACCESS_TOKEN_SECRET'],
      emailTokenSecret: process.env['EMAIL_TOKEN_SECRET'],
      refreshTokenSecret: process.env['REFRESH_TOKEN_SECRET'],
      bookingClientTokenSecret: process.env['BOOKING_CLIENT_TOKEN_SECRET'],
    },
    frontend: {
      domain: process.env['DOMAIN'],
    },
    emailConfig: {
      email: process.env['EMAIL'],
      emailPw: process.env['EMAIL_PW'],
    },
    notificationsConfig: {
      // Enabled by default; set NOTIFICATIONS_ENABLED=false to mute all outgoing notifications (e.g. seeded/test runs).
      enabled: process.env['NOTIFICATIONS_ENABLED'] !== 'false',
    },
    app: {
      locale: process.env['APP_LOCALE'] ?? 'ru',
    },
  };
};

export interface IGoogleCloudConfig {
  bucketName: string;
  projectId: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

export interface IYandexCloudConfig {
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

export interface IVKConfig {
  clientId: string;
  codeVerifier: string;
}

export interface IDatabaseConfig {
  url: string;
}

export interface IJwtConfig {
  accessTokenSecret: string;
  emailTokenSecret: string;
  refreshTokenSecret: string;
  bookingClientTokenSecret: string;
}

export interface IMailerConfig {
  email: string;
  emailPw: string;
}

export interface INotificationsConfig {
  enabled: boolean;
}

export interface IFrontendConfig {
  domain: string;
}

export interface IAppConfig {
  locale: string;
}

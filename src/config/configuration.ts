import { appRole } from './app-role.config.js';
import { databasePoolSize } from './database.config.js';
import { redisUrl } from './redis.config.js';

export default () => {
  return {
    port: parseInt(process.env.PORT ?? '', 10) || 3000,
    logging: {
      level: process.env.LOG_LEVEL ?? 'info',
      directory: process.env.LOG_DIRECTORY ?? 'logs',
    },
    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
    },
    googleCloud: {
      projectId: process.env['GOOGLE_PROJECT_ID'],
      apiKey: process.env['GOOGLE_API_KEY'],
      bucketName: process.env['GOOGLE_BUCKET_NAME'],
      privateBucketName: process.env['GOOGLE_PRIVATE_BUCKET_NAME'],
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
      poolSize: databasePoolSize(),
    },
    redis: {
      url: redisUrl(),
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
      smtpHost: process.env['SMTP_HOST'] ?? 'smtp.hoster.by',
      smtpPort: parseInt(process.env['SMTP_PORT'] ?? '', 10) || 465,
    },
    notificationsConfig: {
      // Enabled by default. CLIENT_NOTIFICATIONS_ENABLED=false (dev/stage) mutes only emails to a business's clients: those
      // environments hold fake bookings that may still carry real contacts. Emails to CRM accounts (registration,
      // password reset, invitations, staff and billing notices) are always sent.
      clientNotificationsEnabled:
        process.env['CLIENT_NOTIFICATIONS_ENABLED'] !== 'false',
    },
    app: {
      locale: process.env['APP_LOCALE'] ?? 'ru',
      role: appRole(),
    },
  };
};

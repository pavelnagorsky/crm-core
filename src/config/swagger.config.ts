import { DocumentBuilder } from '@nestjs/swagger';

export const swaggerConfig = new DocumentBuilder()
  .setTitle('CRM-core API')
  .setDescription('CRM-core API')
  .setVersion('1.0')
  .addBearerAuth(
    {
      description: 'JWT access token — Bearer <token>',
      name: 'Authorization',
      scheme: 'Bearer',
      type: 'http',
      in: 'Header',
    },
    'access-token',
  )
  .addCookieAuth('refresh-token', {
    type: 'apiKey',
    in: 'Cookie',
    name: 'refresh-token',
    description: 'JWT refresh token (HttpOnly cookie)',
  })
  .build();

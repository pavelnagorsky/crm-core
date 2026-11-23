import { DocumentBuilder } from '@nestjs/swagger';

export const swaggerConfig = new DocumentBuilder()
  .setTitle('Klendo Core API')
  .setDescription('Klendo Core API')
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
  .addBearerAuth(
    { type: 'http', scheme: 'Bearer', description: 'Booking management token' },
    'booking-client-token',
  )
  .build();

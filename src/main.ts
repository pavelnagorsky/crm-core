import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { corsOptionsDelegate } from './config/public-cors.js';
import { swaggerConfig } from './config/swagger.config.js';
import { trustProxy } from './config/trust-proxy.config.js';
import { registerDecimalSchemas } from './shared/decorators/api-decimal.decorator.js';
import { GlobalExceptionFilter } from './shared/filters/exception.filter.js';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor.js';
import { exceptionFactory } from './shared/validation/exception-factory.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.set('trust proxy', trustProxy());
  app.use(
    helmet({
      // Swagger UI relies on inline scripts; the API itself serves JSON only.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors(corsOptionsDelegate));
  app.use(cookieParser());

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, exceptionFactory }),
  );

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  registerDecimalSchemas(document);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

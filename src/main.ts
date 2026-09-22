import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor.js';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor.js';
import { GlobalExceptionFilter } from './shared/filters/exception.filter.js';
import { exceptionFactory } from './shared/validation/exception-factory.js';
import { swaggerConfig } from './config/swagger.config.js';
import { corsConfig } from './config/cors.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors(corsConfig);
  app.use(cookieParser());

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, exceptionFactory }),
  );

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

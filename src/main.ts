import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import { AppModule } from './app.module.js';
import { corsOptionsDelegate } from './config/public-cors.js';
import { swaggerConfig } from './config/swagger.config.js';
import { registerDecimalSchemas } from './shared/decorators/api-decimal.decorator.js';
import { GlobalExceptionFilter } from './shared/filters/exception.filter.js';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor.js';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor.js';
import { exceptionFactory } from './shared/validation/exception-factory.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  app.use(cors(corsOptionsDelegate));
  app.use(cookieParser());

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, exceptionFactory }),
  );

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  registerDecimalSchemas(document);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

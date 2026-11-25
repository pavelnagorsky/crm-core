import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SERVICE_PRICE_IMPORT_MAX_BYTES } from '../constants/service-price-import.constants.js';
import { ServicePriceImportFileInterceptor } from '../interceptors/service-price-import-file.interceptor.js';

export const ServicePriceImportFile = () =>
  applyDecorators(
    UseInterceptors(
      ServicePriceImportFileInterceptor,
      FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: SERVICE_PRICE_IMPORT_MAX_BYTES },
      }),
    ),
  );

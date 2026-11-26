import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SERVICE_PRICE_IMPORT_MAX_BYTES } from '../constants/service-price-import.constants.js';
import { ServicePriceImportFileInterceptor } from '../interceptors/service-price-import-file.interceptor.js';

/** A price file upload in memory; larger than `maxBytes` gives 413 PRICE_IMPORT_FILE_TOO_LARGE. */
export const ServicePriceImportFile = (maxBytes = SERVICE_PRICE_IMPORT_MAX_BYTES) =>
  applyDecorators(
    UseInterceptors(
      ServicePriceImportFileInterceptor,
      FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: maxBytes },
      }),
    ),
  );

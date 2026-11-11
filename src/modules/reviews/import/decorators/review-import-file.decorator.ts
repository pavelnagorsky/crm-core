import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { REVIEW_IMPORT_MAX_BYTES } from '../constants/review-import.constants.js';
import { ReviewImportFileInterceptor } from '../interceptors/review-import-file.interceptor.js';

export const ReviewImportFile = () =>
  applyDecorators(
    UseInterceptors(
      ReviewImportFileInterceptor,
      FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: REVIEW_IMPORT_MAX_BYTES },
      }),
    ),
  );

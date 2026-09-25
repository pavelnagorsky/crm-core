import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CLIENT_IMPORT_MAX_BYTES } from '../clients-import.constants.js';
import { ClientImportFileInterceptor } from '../client-import-file.interceptor.js';

export const ClientImportFile = () =>
  applyDecorators(
    UseInterceptors(
      ClientImportFileInterceptor,
      FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: CLIENT_IMPORT_MAX_BYTES },
      }),
    ),
  );

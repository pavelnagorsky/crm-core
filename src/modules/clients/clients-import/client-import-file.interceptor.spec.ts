import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { MulterError } from 'multer';
import { lastValueFrom, throwError } from 'rxjs';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ClientImportFileInterceptor } from './client-import-file.interceptor.js';

describe('ClientImportFileInterceptor', () => {
  const interceptor = new ClientImportFileInterceptor();

  it('maps an oversized multipart upload to the import size error', async () => {
    const error = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, {
        handle: () => throwError(() => new MulterError('LIMIT_FILE_SIZE')),
      }),
    ).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.errorCode).toBe(ErrorCode.CLIENT_IMPORT_FILE_TOO_LARGE.code);
    expect(exception.message).toBe(ErrorCode.CLIENT_IMPORT_FILE_TOO_LARGE.message);
    expect(exception.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
  });
});

import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { MulterError } from 'multer';
import { lastValueFrom, throwError } from 'rxjs';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ServicePriceImportFileInterceptor } from './service-price-import-file.interceptor.js';

describe('ServicePriceImportFileInterceptor', () => {
  it('maps an oversized upload to the size error', async () => {
    const error = await lastValueFrom(
      new ServicePriceImportFileInterceptor().intercept(
        {} as ExecutionContext,
        { handle: () => throwError(() => new MulterError('LIMIT_FILE_SIZE')) },
      ),
    ).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.errorCode).toBe(
      ErrorCode.PRICE_IMPORT_FILE_TOO_LARGE.code,
    );
    expect(exception.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
  });
});

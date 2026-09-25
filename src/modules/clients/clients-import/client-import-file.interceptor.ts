import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { MulterError } from 'multer';
import { catchError, Observable, throwError } from 'rxjs';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

@Injectable()
export class ClientImportFileInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return throwError(
            () => new AppException(ErrorCode.CLIENT_IMPORT_FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}

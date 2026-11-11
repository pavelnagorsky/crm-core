import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';

/** `FileInterceptor` reports the multer size limit as `PayloadTooLargeException`. */
@Injectable()
export class ReviewImportFileInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((err: unknown) =>
          throwError(() =>
            err instanceof PayloadTooLargeException
              ? new AppException(
                  ErrorCode.REVIEW_IMPORT_FILE_TOO_LARGE,
                  HttpStatus.PAYLOAD_TOO_LARGE,
                )
              : err,
          ),
        ),
      );
  }
}

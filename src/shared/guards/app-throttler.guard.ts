import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppException } from '../exceptions/app.exception.js';
import { ErrorCode } from '../validation/error-codes.enum.js';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    _context: ExecutionContext,
  ): Promise<void> {
    throw new AppException(
      ErrorCode.TOO_MANY_REQUESTS,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../validation/error-codes.enum.js';

export class AppException extends HttpException {
  readonly errorCode: ErrorCode;
  readonly payload: unknown;

  constructor(
    errorCode: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    payload: unknown = null,
  ) {
    super(message, status);
    this.errorCode = errorCode;
    this.payload = payload;
  }
}

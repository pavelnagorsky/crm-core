import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeEntry } from '../validation/error-codes.enum.js';

export class AppException extends HttpException {
  readonly errorCode: string;
  readonly payload: unknown;

  constructor(
    entry: ErrorCodeEntry,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    payload: unknown = null,
  ) {
    super(entry.message, status);
    this.errorCode = entry.code;
    this.payload = payload;
  }
}

import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LoginErrorEnum } from '../enums/login-error.enum.js';

const LOGIN_ERROR_MAP: Record<LoginErrorEnum, (typeof ErrorCode)[keyof typeof ErrorCode]> = {
  [LoginErrorEnum.INVALID_DATA]: ErrorCode.INVALID_CREDENTIALS,
  [LoginErrorEnum.EMAIL_NOT_CONFIRMED]: ErrorCode.EMAIL_NOT_CONFIRMED,
  [LoginErrorEnum.PASSWORD_NOT_SET]: ErrorCode.PASSWORD_NOT_SET,
};

export class LoginException extends AppException {
  constructor(error: LoginErrorEnum) {
    super(LOGIN_ERROR_MAP[error], HttpStatus.UNAUTHORIZED);
  }
}

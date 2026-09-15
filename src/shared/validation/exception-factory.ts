import { HttpStatus } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { AppException } from '../exceptions/app.exception.js';
import { ErrorCode } from './error-codes.enum.js';

export const exceptionFactory = (validationErrors: ValidationError[] = []) => {
  const payload = validationErrors.map((error) => ({
    field: error.property,
    error: Object.values(error.constraints ?? {}).join(', '),
  }));
  return new AppException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, payload);
};

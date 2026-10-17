import { HttpStatus } from '@nestjs/common';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCodeEntry } from '../../../shared/interfaces/error-code-entry.interface.js';

export function rethrowPrisma(
  error: unknown,
  unique: ErrorCodeEntry,
  missing: ErrorCodeEntry,
): never {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
  if (code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
    throw new AppException(unique, HttpStatus.CONFLICT);
  }
  if (code === PrismaErrorCode.RECORD_NOT_FOUND) {
    throw new AppException(missing, HttpStatus.NOT_FOUND);
  }
  throw error;
}

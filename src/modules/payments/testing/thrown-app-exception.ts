import { AppException } from '../../../shared/exceptions/app.exception.js';

/** The AppException `run` throws; fails the test when it throws nothing or something else. */
export function thrownAppException(run: () => unknown): AppException {
  try {
    run();
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('Expected an AppException');
}

import { AppException } from '../../../shared/exceptions/app.exception.js';

/** The AppException `promise` rejects with; fails the test when it resolves or rejects otherwise. */
export async function rejectedAppException(
  promise: Promise<unknown>,
): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('Expected an AppException');
}

import { HttpException, HttpStatus } from '@nestjs/common';
import { EmailErrorDetails } from '../interfaces/email-error-details.interface.js';

/** Replies that say the mailbox or address will not take the email, whatever we do. */
const PERMANENT_SMTP_CODES: ReadonlySet<number> = new Set([501, 550, 551, 553]);
const MAX_ERROR_LENGTH = 2000;

/** SMTP and render errors as the delivery log stores them. */
export function classifyEmailError(error: unknown): EmailErrorDetails {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).slice(0, MAX_ERROR_LENGTH);
  const responseCode =
    typeof error === 'object' && error !== null && 'responseCode' in error
      ? Number(error.responseCode)
      : NaN;
  const code = Number.isInteger(responseCode) ? responseCode : null;
  const smtpCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : null;
  const permanent =
    (code !== null && PERMANENT_SMTP_CODES.has(code)) ||
    smtpCode === 'EENVELOPE' ||
    // Rendering failed: the same data fails the same way.
    (typeof error === 'object' && error !== null && 'renderError' in error) ||
    // The business the email is about is gone.
    (error instanceof HttpException &&
      error.getStatus() === HttpStatus.NOT_FOUND);
  return { message, code, permanent };
}

export interface ErrorCodeEntry {
  code: string;
  message: string;
}

export const ErrorCode = {
  // system
  INTERNAL_ERROR:    { code: 'INTERNAL_ERROR',    message: 'Internal server error' },
  VALIDATION_ERROR:  { code: 'VALIDATION_ERROR',  message: 'Validation failed' },
  BAD_REQUEST:       { code: 'BAD_REQUEST',        message: 'Bad request' },
  UNAUTHORIZED:      { code: 'UNAUTHORIZED',       message: 'Unauthorized' },
  FORBIDDEN:         { code: 'FORBIDDEN',          message: 'Forbidden' },
  NOT_FOUND:         { code: 'NOT_FOUND',          message: 'Not found' },

  // auth
  EMAIL_ALREADY_IN_USE: { code: 'EMAIL_ALREADY_IN_USE', message: 'Email already in use' },
  INVALID_CREDENTIALS:  { code: 'INVALID_CREDENTIALS',  message: 'Invalid credentials' },
  EMAIL_NOT_CONFIRMED:  { code: 'EMAIL_NOT_CONFIRMED',  message: 'Email not confirmed' },
  PASSWORD_NOT_SET:     { code: 'PASSWORD_NOT_SET',     message: 'Password not set' },

  // user
  USER_NOT_FOUND: { code: 'USER_NOT_FOUND', message: 'User not found' },

  // services
  CATEGORY_NAME_EXISTS: { code: 'CATEGORY_NAME_EXISTS', message: 'Category name already exists in this business' },

  // clients
  CLIENT_PHONE_EXISTS: { code: 'CLIENT_PHONE_EXISTS', message: 'A client with this phone number already exists in this business' },
} as const satisfies Record<string, ErrorCodeEntry>;

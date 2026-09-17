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

  // staff invitations
  STAFF_INVITATION_NOT_FOUND:  { code: 'STAFF_INVITATION_NOT_FOUND',  message: 'Invitation not found or already used' },
  STAFF_INVITATION_EXPIRED:    { code: 'STAFF_INVITATION_EXPIRED',    message: 'Invitation has expired' },
  STAFF_ALREADY_LINKED:        { code: 'STAFF_ALREADY_LINKED',        message: 'This staff member is already linked to a user account' },
  STAFF_USER_ALREADY_MEMBER:   { code: 'STAFF_USER_ALREADY_MEMBER',   message: 'You are already a member of this business' },

  // bookings
  BOOKING_NOT_AVAILABLE:     { code: 'BOOKING_NOT_AVAILABLE',     message: 'Online booking is not available for this business' },
  BOOKING_ALREADY_CANCELLED: { code: 'BOOKING_ALREADY_CANCELLED', message: 'Booking is already cancelled' },
  BOOKING_BUSINESS_NOT_FOUND:  { code: 'BOOKING_BUSINESS_NOT_FOUND',  message: 'Business not found' },
  BOOKING_SERVICE_NOT_FOUND:   { code: 'BOOKING_SERVICE_NOT_FOUND',   message: 'Service not found' },
  BOOKING_SERVICE_INACTIVE:    { code: 'BOOKING_SERVICE_INACTIVE',    message: 'Service is not available for booking' },
  BOOKING_STAFF_NOT_FOUND:     { code: 'BOOKING_STAFF_NOT_FOUND',     message: 'Staff member not found or does not perform this service' },
  BOOKING_SLOT_UNAVAILABLE:    { code: 'BOOKING_SLOT_UNAVAILABLE',    message: 'The requested slot is not available' },
  BOOKING_NO_STAFF_AVAILABLE:  { code: 'BOOKING_NO_STAFF_AVAILABLE',  message: 'No staff available for this service at the requested time' },
} as const satisfies Record<string, ErrorCodeEntry>;

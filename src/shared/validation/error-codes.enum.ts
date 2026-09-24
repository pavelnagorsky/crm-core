export interface ErrorCodeEntry {
  code: string;
  message: string;
}

export const ErrorCode = {
  // system
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
  BAD_REQUEST: { code: 'BAD_REQUEST', message: 'Bad request' },
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'Forbidden' },
  NOT_FOUND: { code: 'NOT_FOUND', message: 'Not found' },

  // auth
  EMAIL_ALREADY_IN_USE: {
    code: 'EMAIL_ALREADY_IN_USE',
    message: 'Email already in use',
  },
  PHONE_ALREADY_IN_USE: {
    code: 'PHONE_ALREADY_IN_USE',
    message: 'Phone number already in use',
  },
  INVALID_CREDENTIALS: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid credentials',
  },
  EMAIL_NOT_CONFIRMED: {
    code: 'EMAIL_NOT_CONFIRMED',
    message: 'Email not confirmed',
  },
  PASSWORD_NOT_SET: { code: 'PASSWORD_NOT_SET', message: 'Password not set' },
  INVALID_RESET_CODE: {
    code: 'INVALID_RESET_CODE',
    message: 'Invalid or expired reset code',
  },
  RESET_CODE_RESEND_TOO_SOON: {
    code: 'RESET_CODE_RESEND_TOO_SOON',
    message: 'Please wait before requesting a new code',
  },

  // user
  USER_NOT_FOUND: { code: 'USER_NOT_FOUND', message: 'User not found' },

  // services
  CATEGORY_NAME_EXISTS: {
    code: 'CATEGORY_NAME_EXISTS',
    message: 'Category name already exists in this business',
  },
  SERVICE_IN_USE: {
    code: 'SERVICE_IN_USE',
    message: 'Service cannot be deleted because it is used in bookings or compensation plans',
  },
  SERVICE_STATUS_ALREADY_SET: {
    code: 'SERVICE_STATUS_ALREADY_SET',
    message: 'Service already has this status',
  },

  // clients
  CLIENT_PHONE_EXISTS: {
    code: 'CLIENT_PHONE_EXISTS',
    message: 'A client with this phone number already exists in this business',
  },

  // staff
  STAFF_STATUS_ALREADY_SET: {
    code: 'STAFF_STATUS_ALREADY_SET',
    message: 'Staff member already has this status',
  },
  STAFF_HAS_BOOKINGS: {
    code: 'STAFF_HAS_BOOKINGS',
    message: 'Staff member cannot be deleted because they have associated bookings',
  },

  // staff invitations
  STAFF_INVITATION_NOT_FOUND: {
    code: 'STAFF_INVITATION_NOT_FOUND',
    message: 'Invitation not found or already used',
  },
  STAFF_INVITATION_EXPIRED: {
    code: 'STAFF_INVITATION_EXPIRED',
    message: 'Invitation has expired',
  },
  STAFF_ALREADY_LINKED: {
    code: 'STAFF_ALREADY_LINKED',
    message: 'This staff member is already linked to a user account',
  },
  STAFF_USER_ALREADY_MEMBER: {
    code: 'STAFF_USER_ALREADY_MEMBER',
    message: 'You are already a member of this business',
  },

  // files
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: 'File exceeds the maximum allowed size',
  },
  FILE_INVALID_TYPE: {
    code: 'FILE_INVALID_TYPE',
    message: 'File type is not allowed',
  },
  FILE_UPLOAD_FAILED: {
    code: 'FILE_UPLOAD_FAILED',
    message: 'Failed to upload file to storage',
  },
  FILE_NOT_FOUND: { code: 'FILE_NOT_FOUND', message: 'File not found' },
  FILE_DELETE_FAILED: {
    code: 'FILE_DELETE_FAILED',
    message: 'Failed to delete file from storage',
  },

  // bookings
  BOOKING_NOT_AVAILABLE: {
    code: 'BOOKING_NOT_AVAILABLE',
    message: 'Online booking is not available for this business',
  },
  BOOKING_ALREADY_CANCELLED: {
    code: 'BOOKING_ALREADY_CANCELLED',
    message: 'Booking is already cancelled',
  },
  BOOKING_BUSINESS_NOT_FOUND: {
    code: 'BOOKING_BUSINESS_NOT_FOUND',
    message: 'Business not found',
  },
  BOOKING_SERVICE_NOT_FOUND: {
    code: 'BOOKING_SERVICE_NOT_FOUND',
    message: 'Service not found',
  },
  BOOKING_SERVICE_INACTIVE: {
    code: 'BOOKING_SERVICE_INACTIVE',
    message: 'Service is not available for booking',
  },
  BOOKING_STAFF_NOT_FOUND: {
    code: 'BOOKING_STAFF_NOT_FOUND',
    message: 'Staff member not found or does not perform this service',
  },
  BOOKING_SLOT_UNAVAILABLE: {
    code: 'BOOKING_SLOT_UNAVAILABLE',
    message: 'The requested slot is not available',
  },
  BOOKING_NO_STAFF_AVAILABLE: {
    code: 'BOOKING_NO_STAFF_AVAILABLE',
    message: 'No staff available for this service at the requested time',
  },

  STAFF_HAS_EARNINGS: {
    code: 'STAFF_HAS_EARNINGS',
    message: 'Staff member cannot be deleted because they have associated earnings',
  },

  // compensation / payroll
  COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID: {
    code: 'COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID',
    message: 'New compensation plan must start after the latest existing version',
  },
  COMPENSATION_SERVICE_NOT_FOUND: {
    code: 'COMPENSATION_SERVICE_NOT_FOUND',
    message: 'One or more services for commission overrides were not found in this business',
  },
  PAYROLL_PERIOD_DATES_INVALID: {
    code: 'PAYROLL_PERIOD_DATES_INVALID',
    message: 'Payroll period end date must be on or after the start date',
  },
  PAYROLL_PERIOD_OVERLAP: {
    code: 'PAYROLL_PERIOD_OVERLAP',
    message: 'Payroll period overlaps an existing period for this business',
  },
  PAYROLL_PERIOD_NOT_FOUND: {
    code: 'PAYROLL_PERIOD_NOT_FOUND',
    message: 'Payroll period not found',
  },
  PAYROLL_PERIOD_INVALID_STATUS: {
    code: 'PAYROLL_PERIOD_INVALID_STATUS',
    message: 'Payroll period is not in a valid status for this action',
  },
  PAYROLL_RESULT_NOT_FOUND: {
    code: 'PAYROLL_RESULT_NOT_FOUND',
    message: 'Payroll result not found',
  },
  PAYROLL_CORRECTION_NOT_ALLOWED: {
    code: 'PAYROLL_CORRECTION_NOT_ALLOWED',
    message: 'Corrections are only allowed after the payroll period is approved',
  },
  STAFF_EARNING_NOT_FOUND: {
    code: 'STAFF_EARNING_NOT_FOUND',
    message: 'Staff earning not found',
  },
  STAFF_EARNING_ALREADY_REVERSED: {
    code: 'STAFF_EARNING_ALREADY_REVERSED',
    message: 'This earning has already been reversed',
  },
  STAFF_EARNING_DATE_LOCKED: {
    code: 'STAFF_EARNING_DATE_LOCKED',
    message: 'Cannot add a manual earning on a date inside an approved or paid payroll period',
  },
  STAFF_EARNING_AMOUNT_INVALID: {
    code: 'STAFF_EARNING_AMOUNT_INVALID',
    message: 'Earning amount is invalid for this type',
  },
  PRODUCT_COMMISSION_NOT_CONFIGURED: {
    code: 'PRODUCT_COMMISSION_NOT_CONFIGURED',
    message: 'Staff member has no product commission for this date',
  },

  // dashboard
  DASHBOARD_CUSTOM_RANGE_REQUIRED: {
    code: 'DASHBOARD_CUSTOM_RANGE_REQUIRED',
    message: 'from and to are required when period is CUSTOM',
  },
  DASHBOARD_CUSTOM_RANGE_INVALID: {
    code: 'DASHBOARD_CUSTOM_RANGE_INVALID',
    message: 'Invalid dashboard date range',
  },
} as const satisfies Record<string, ErrorCodeEntry>;

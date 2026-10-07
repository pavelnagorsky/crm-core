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
  TOKEN_PAYLOAD_STALE: {
    code: 'TOKEN_PAYLOAD_STALE',
    message: 'Access token payload is stale; refresh and retry the request',
  },

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

  // brand / locations
  LOCATION_ANCHORS_IMMUTABLE: {
    code: 'LOCATION_ANCHORS_IMMUTABLE',
    message:
      'Country, currency, and timezone cannot be changed after location creation',
  },

  // services
  CATEGORY_NAME_EXISTS: {
    code: 'CATEGORY_NAME_EXISTS',
    message: 'Category name already exists in this business',
  },
  SERVICE_IN_USE: {
    code: 'SERVICE_IN_USE',
    message:
      'Service cannot be deleted because it is used in bookings or compensation plans',
  },
  SERVICE_STATUS_ALREADY_SET: {
    code: 'SERVICE_STATUS_ALREADY_SET',
    message: 'Service already has this status',
  },
  BUNDLE_FIXED_PRICE_REQUIRED: {
    code: 'BUNDLE_FIXED_PRICE_REQUIRED',
    message: 'Fixed-price bundle must have a fixed price',
  },
  BUNDLE_PRICE_MODE_INVALID: {
    code: 'BUNDLE_PRICE_MODE_INVALID',
    message: 'Bundle pricing mode does not match fixed price value',
  },
  BUNDLE_ITEMS_INVALID: {
    code: 'BUNDLE_ITEMS_INVALID',
    message: 'Bundle must contain between 2 and 10 services',
  },

  // clients
  CLIENT_PHONE_EXISTS: {
    code: 'CLIENT_PHONE_EXISTS',
    message: 'A client with this phone number already exists in this business',
  },
  CLIENT_BANNED: {
    code: 'CLIENT_BANNED',
    message: 'Online booking is not available for this phone number',
  },
  CLIENT_BAN_ALREADY_SET: {
    code: 'CLIENT_BAN_ALREADY_SET',
    message: 'Client ban is already in this state',
  },
  CLIENT_IMPORT_FILE_MISSING: {
    code: 'CLIENT_IMPORT_FILE_MISSING',
    message: 'Import file is missing',
  },
  CLIENT_IMPORT_FILE_TOO_LARGE: {
    code: 'CLIENT_IMPORT_FILE_TOO_LARGE',
    message: 'Import file exceeds the maximum allowed size',
  },
  CLIENT_IMPORT_FILE_UNSUPPORTED: {
    code: 'CLIENT_IMPORT_FILE_UNSUPPORTED',
    message: 'Import file must be an .xlsx spreadsheet',
  },
  CLIENT_IMPORT_FILE_CORRUPT: {
    code: 'CLIENT_IMPORT_FILE_CORRUPT',
    message: 'Import file could not be read',
  },
  CLIENT_IMPORT_MISSING_COLUMNS: {
    code: 'CLIENT_IMPORT_MISSING_COLUMNS',
    message: 'Import file is missing required columns',
  },
  CLIENT_IMPORT_FILE_EMPTY: {
    code: 'CLIENT_IMPORT_FILE_EMPTY',
    message: 'Import file has no client rows',
  },
  CLIENT_IMPORT_TOO_MANY_ROWS: {
    code: 'CLIENT_IMPORT_TOO_MANY_ROWS',
    message: 'Import file exceeds the row limit',
  },

  // staff
  STAFF_STATUS_ALREADY_SET: {
    code: 'STAFF_STATUS_ALREADY_SET',
    message: 'Staff member already has this status',
  },
  STAFF_HAS_BOOKINGS: {
    code: 'STAFF_HAS_BOOKINGS',
    message:
      'Staff member cannot be deleted because they have associated bookings',
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
  BOOKING_BUNDLE_NOT_FOUND: {
    code: 'BOOKING_BUNDLE_NOT_FOUND',
    message: 'Bundle not found',
  },
  BOOKING_SELECTION_CONFLICT: {
    code: 'BOOKING_SELECTION_CONFLICT',
    message: 'Set either services or a bundle, not both',
  },
  BOOKING_ITEM_NOT_FOUND: {
    code: 'BOOKING_ITEM_NOT_FOUND',
    message: 'Booking item not found',
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
  BOOKING_SLOT_RANGE_TOO_LONG: {
    code: 'BOOKING_SLOT_RANGE_TOO_LONG',
    message: 'Date range cannot exceed 62 days',
  },
  BOOKING_RATE_LIMITED: {
    code: 'BOOKING_RATE_LIMITED',
    message: 'Too many booking attempts. Try again later',
  },
  BOOKING_CHANNEL_CONFLICT: {
    code: 'BOOKING_CHANNEL_CONFLICT',
    message: 'Set either a booking page or a booking widget, not both',
  },

  // booking channels
  BOOKING_PAGE_NOT_FOUND: {
    code: 'BOOKING_PAGE_NOT_FOUND',
    message: 'Booking page not found',
  },
  BOOKING_PAGE_SLUG_TAKEN: {
    code: 'BOOKING_PAGE_SLUG_TAKEN',
    message: 'This slug is already used',
  },
  BOOKING_PAGE_SLUG_RESERVED: {
    code: 'BOOKING_PAGE_SLUG_RESERVED',
    message: 'This slug is reserved',
  },
  BOOKING_PAGE_COVER_INVALID: {
    code: 'BOOKING_PAGE_COVER_INVALID',
    message: 'Cover must be an image uploaded for this business',
  },
  BOOKING_WIDGET_NOT_FOUND: {
    code: 'BOOKING_WIDGET_NOT_FOUND',
    message: 'Booking widget not found',
  },
  BOOKING_WIDGET_TITLE_EXISTS: {
    code: 'BOOKING_WIDGET_TITLE_EXISTS',
    message: 'A widget with this title already exists in this business',
  },
  BOOKING_CHANNEL_STATUS_ALREADY_SET: {
    code: 'BOOKING_CHANNEL_STATUS_ALREADY_SET',
    message: 'Booking channel already has this status',
  },
  BOOKING_CHANNEL_CLOSED: {
    code: 'BOOKING_CHANNEL_CLOSED',
    message: 'Online booking is closed for this business',
  },
  BOOKING_CHANNEL_NOT_BOOKABLE: {
    code: 'BOOKING_CHANNEL_NOT_BOOKABLE',
    message:
      'Publish requires an active service assigned to an active staff member',
  },
  WIDGET_DOMAIN_NOT_ALLOWED: {
    code: 'WIDGET_DOMAIN_NOT_ALLOWED',
    message: 'This widget is not allowed on the requesting domain',
  },
  STAFF_HAS_EARNINGS: {
    code: 'STAFF_HAS_EARNINGS',
    message:
      'Staff member cannot be deleted because they have associated earnings',
  },

  // compensation / payroll
  COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID: {
    code: 'COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID',
    message:
      'New compensation plan must start after the latest existing version',
  },
  COMPENSATION_SERVICE_NOT_FOUND: {
    code: 'COMPENSATION_SERVICE_NOT_FOUND',
    message:
      'One or more services for commission overrides were not found in this business',
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
    message:
      'Corrections are only allowed after the payroll period is approved',
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
    message:
      'Cannot add a manual earning on a date inside an approved or paid payroll period',
  },
  STAFF_EARNING_AMOUNT_INVALID: {
    code: 'STAFF_EARNING_AMOUNT_INVALID',
    message: 'Earning amount is invalid for this type',
  },
  PRODUCT_COMMISSION_NOT_CONFIGURED: {
    code: 'PRODUCT_COMMISSION_NOT_CONFIGURED',
    message: 'Staff member has no product commission for this date',
  },

  // products
  PRODUCT_CATEGORY_NAME_EXISTS: {
    code: 'PRODUCT_CATEGORY_NAME_EXISTS',
    message: 'Product category name already exists in this brand',
  },
  PRODUCT_SKU_EXISTS: {
    code: 'PRODUCT_SKU_EXISTS',
    message: 'Product SKU already exists in this brand',
  },
  PRODUCT_BARCODE_EXISTS: {
    code: 'PRODUCT_BARCODE_EXISTS',
    message: 'Product barcode already exists in this brand',
  },
  PRODUCT_STATUS_ALREADY_SET: {
    code: 'PRODUCT_STATUS_ALREADY_SET',
    message: 'Product already has this status',
  },
  PRODUCT_IN_USE: {
    code: 'PRODUCT_IN_USE',
    message:
      'Product cannot be deleted because it is used by stock or sales records',
  },
  PRODUCT_INVENTORY_TRACKING_IMMUTABLE: {
    code: 'PRODUCT_INVENTORY_TRACKING_IMMUTABLE',
    message:
      'Inventory tracking cannot be disabled after it has been enabled for a location',
  },

  // inventory
  INVENTORY_PRODUCT_NOT_CONFIGURED: {
    code: 'INVENTORY_PRODUCT_NOT_CONFIGURED',
    message:
      'One or more products are not configured for inventory in this location',
  },
  INVENTORY_DOCUMENT_NOT_OPEN: {
    code: 'INVENTORY_DOCUMENT_NOT_OPEN',
    message: 'Only an open inventory document can be changed or posted',
  },
  INVENTORY_DOCUMENT_INVALID: {
    code: 'INVENTORY_DOCUMENT_INVALID',
    message: 'Inventory document items are invalid for this operation type',
  },
  INVENTORY_INSUFFICIENT_STOCK: {
    code: 'INVENTORY_INSUFFICIENT_STOCK',
    message: 'Inventory operation would make stock negative',
  },
  INVENTORY_REVERSAL_NOT_ALLOWED: {
    code: 'INVENTORY_REVERSAL_NOT_ALLOWED',
    message:
      'Inventory document cannot be reversed after later stock movements',
  },
  INVENTORY_DESTINATION_INVALID: {
    code: 'INVENTORY_DESTINATION_INVALID',
    message:
      'Inventory transfer destination must be another location in the same brand',
  },
  INVENTORY_UNIT_COST_REQUIRED: {
    code: 'INVENTORY_UNIT_COST_REQUIRED',
    message: 'Unit cost is required when inventory value increases',
  },
  INVENTORY_REASON_REQUIRED: {
    code: 'INVENTORY_REASON_REQUIRED',
    message: 'A reason is required for this inventory operation',
  },
  INVENTORY_DUPLICATE_PRODUCT: {
    code: 'INVENTORY_DUPLICATE_PRODUCT',
    message: 'A product can appear only once in an inventory document',
  },
  INVENTORY_FUTURE_DATE: {
    code: 'INVENTORY_FUTURE_DATE',
    message: 'Inventory operation date cannot be in the future',
  },

  // orders
  ORDER_NOT_OPEN: {
    code: 'ORDER_NOT_OPEN',
    message: 'Only an open order can be changed or deleted',
  },
  ORDER_STATUS_INVALID: {
    code: 'ORDER_STATUS_INVALID',
    message: 'Order is not in a valid status for this action',
  },
  ORDER_PRODUCT_NOT_SELLABLE: {
    code: 'ORDER_PRODUCT_NOT_SELLABLE',
    message:
      'One or more products are no longer available for sale in this location',
  },
  ORDER_SELLER_INVALID: {
    code: 'ORDER_SELLER_INVALID',
    message:
      'One or more sellers are not active staff members in this location',
  },
  ORDER_CLIENT_BOOKING_MISMATCH: {
    code: 'ORDER_CLIENT_BOOKING_MISMATCH',
    message: 'Order client does not match the linked booking client',
  },
  ORDER_DUPLICATE_PRODUCT: {
    code: 'ORDER_DUPLICATE_PRODUCT',
    message: 'A product can appear only once in this order',
  },
  ORDER_QUANTITY_INVALID: {
    code: 'ORDER_QUANTITY_INVALID',
    message: 'Order item quantity must be greater than zero',
  },
  ORDER_VOID_REASON_REQUIRED: {
    code: 'ORDER_VOID_REASON_REQUIRED',
    message: 'A reason is required to void a posted order',
  },
  ORDER_FUTURE_DATE: {
    code: 'ORDER_FUTURE_DATE',
    message: 'Order date cannot be in the future',
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

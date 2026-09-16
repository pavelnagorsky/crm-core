import type { Business } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const BUSINESS_AUDIT_FIELDS: FieldDescriptor<Business>[] = [
  { key: 'name' },
  { key: 'timezone' },
  { key: 'currency' },
  { key: 'bookingVisibility' },
  { key: 'advanceBookingWindowDays' },
  { key: 'slotIntervalMinutes' },
  { key: 'minimumBookingNoticeMinutes' },
  { key: 'isBookingConfirmationRequired' },
];

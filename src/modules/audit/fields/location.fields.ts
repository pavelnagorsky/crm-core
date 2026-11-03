import type { Location } from '@prisma/client';
import type { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

export const LOCATION_AUDIT_FIELDS: FieldDescriptor<Location>[] = [
  { key: 'name' },
  { key: 'businessType', i18n: 'businessType' },
  { key: 'city' },
  { key: 'addressLine' },
  { key: 'phone' },
  { key: 'instagram' },
  { key: 'telegram' },
  { key: 'whatsapp' },
  { key: 'website' },
  { key: 'mapWidgetUrl' },
  { key: 'advanceBookingWindowDays' },
  { key: 'slotIntervalMinutes' },
  { key: 'minimumBookingNoticeMinutes' },
  { key: 'bookingVisibility', i18n: 'bookingVisibility' },
  { key: 'isBookingConfirmationRequired', i18n: 'booleanValue' },
];

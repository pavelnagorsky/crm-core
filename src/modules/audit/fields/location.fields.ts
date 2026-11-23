import type { Location, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
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
  { key: 'googleReviewUrl' },
  { key: 'yandexReviewUrl' },
  { key: 'reviewsEnabled', i18n: 'booleanValue' },
  { key: 'advanceBookingWindowDays' },
  { key: 'slotIntervalMinutes' },
  { key: 'minimumBookingNoticeMinutes' },
  { key: 'bookingVisibility', i18n: 'bookingVisibility' },
  { key: 'isBookingConfirmationRequired', i18n: 'booleanValue' },
  { key: 'notifyClientOnStaffChanges', i18n: 'booleanValue' },
  { key: 'anyStaffEnabled', i18n: 'booleanValue' },
  { key: 'anyStaffRule' },
  { key: 'priceRoundingStep', format: (value) => MoneyUtils.format(value as Prisma.Decimal) },
  { key: 'paymentTrackingMode', i18n: 'paymentTrackingMode' },
];

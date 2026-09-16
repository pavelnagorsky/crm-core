import type { Business } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const BUSINESS_AUDIT_FIELDS: FieldDescriptor<Business>[] = [
  { key: 'name', labelRu: 'Название' },
  { key: 'timezone', labelRu: 'Часовой пояс' },
  { key: 'currency', labelRu: 'Валюта' },
  { key: 'bookingVisibility', labelRu: 'Видимость записей' },
  { key: 'advanceBookingWindowDays', labelRu: 'Окно бронирования (дней)' },
  { key: 'slotIntervalMinutes', labelRu: 'Интервал слотов (мин)' },
  { key: 'minimumBookingNoticeMinutes', labelRu: 'Мин. время до записи (мин)' },
  { key: 'isBookingConfirmationRequired', labelRu: 'Требуется подтверждение' },
];

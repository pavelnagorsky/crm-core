import { CalendarEvent } from '@prisma/client';
import { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

export const CALENDAR_AUDIT_FIELDS: FieldDescriptor<CalendarEvent>[] = [
  { key: 'startDateTime', type: 'datetime' },
  { key: 'endDateTime', type: 'datetime' },
  { key: 'repeatUntil', type: 'date' },
  { key: 'repeatType', i18n: 'calendarRepeatType' },
];

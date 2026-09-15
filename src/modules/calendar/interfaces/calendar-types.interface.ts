import { CalendarEvent } from '@prisma/client';

export type CalendarEventWithCancellations = CalendarEvent & {
  cancelledOccurrences: { occurrenceDate: Date }[];
};

export type Interval = { start: number; end: number };

export type EventTimes = { date: string; startHHmm: string; endHHmm: string };

import { CalendarEventRepeatType, Prisma } from '@prisma/client';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';

export function blockingEventsWhere(
  locationId: string,
  staffIds: string[],
  startAt: Date,
  endAt: Date,
  excludedEventIds: string[] = [],
): Prisma.CalendarEventWhereInput {
  return {
    locationId,
    location: ACTIVE_LOCATION_WHERE,
    ...(excludedEventIds.length ? { id: { notIn: excludedEventIds } } : {}),
    AND: [
      { OR: [{ staffId: null }, { staffId: { in: staffIds } }] },
      {
        OR: [
          {
            repeatType: CalendarEventRepeatType.NONE,
            startDateTime: { lt: endAt },
            endDateTime: { gt: startAt },
          },
          {
            repeatType: { not: CalendarEventRepeatType.NONE },
            startDateTime: { lt: endAt },
            // Date-only repeat limits can precede UTC midnight, and an overnight occurrence can spill into this day.
            OR: [
              { repeatUntil: null },
              {
                repeatUntil: { gte: new Date(startAt.getTime() - 86_400_000) },
              },
            ],
          },
        ],
      },
    ],
  };
}

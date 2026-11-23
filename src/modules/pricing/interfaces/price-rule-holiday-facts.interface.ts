import { PriceScheduleType } from '@prisma/client';

/** What the holiday conflict check looks at in a rule being saved. */
export interface PriceRuleHolidayFacts {
  scheduleType: PriceScheduleType;
  holidayExclusive: boolean;
  enabled: boolean;
  yearly: boolean;
  /** YYYY-MM-DD. */
  dates: string[];
}

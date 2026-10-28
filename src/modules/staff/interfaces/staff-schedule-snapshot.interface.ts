import { StaffShift } from '@prisma/client';

export interface StaffScheduleSnapshot {
  timezone: string;
  coveredFrom: Date;
  coveredTo: Date;
  shifts: Pick<StaffShift, 'staffId' | 'date' | 'startTime' | 'endTime'>[];
}

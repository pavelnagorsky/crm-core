import { StaffCompensationPlan, StaffCompensationServiceRate } from '@prisma/client';

export interface CompensationPlanWithRates extends StaffCompensationPlan {
  serviceRates: StaffCompensationServiceRate[];
}

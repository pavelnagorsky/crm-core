import { Staff, StaffShift } from '@prisma/client';
import { CompensationPlanWithRates } from '../../compensation/interfaces/compensation-plan-with-rates.interface.js';
import { PayrollPeriodWithResults } from './payroll-period-with-results.interface.js';

export interface PayrollCalculationContext {
  period: PayrollPeriodWithResults;
  staffById: Map<string, Staff>;
  shifts: StaffShift[];
  plansByStaff: Map<string, CompensationPlanWithRates[]>;
  dates: string[];
}

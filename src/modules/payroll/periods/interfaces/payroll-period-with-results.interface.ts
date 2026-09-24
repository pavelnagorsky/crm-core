import { PayrollPeriod, PayrollResult } from '@prisma/client';

export interface PayrollPeriodWithResults extends PayrollPeriod {
  results: PayrollResult[];
}

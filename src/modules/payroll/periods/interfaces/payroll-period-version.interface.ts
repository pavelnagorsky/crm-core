import { PayrollPeriodStatus } from '@prisma/client';

export interface PayrollPeriodVersion {
  status: PayrollPeriodStatus;
  updatedAt: Date;
}

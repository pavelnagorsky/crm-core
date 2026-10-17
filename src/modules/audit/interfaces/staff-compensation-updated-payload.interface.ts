export interface StaffCompensationUpdatedPayload {
  effectiveFrom: string;
  serviceCommissionPercent: string | null;
  productCommissionPercent: string | null;
  fixedSalaryAmount: string | null;
  hourlyRate: string | null;
  salaryMode: string;
  currency: string;
}

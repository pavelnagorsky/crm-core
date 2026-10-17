export interface StaffEarningAuditPayload {
  type?: string;
  amount: string;
  currency: string;
  reason?: string;
  bookingId?: string;
  bookingItemId?: string | null;
  externalId?: string;
  staffId?: string;
}

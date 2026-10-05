export interface AuditFieldChange {
  field: string;
  from: string;
  to: string;
}

// ─── Booking ────────────────────────────────────────────────────────────────

interface BookingCreatedItemPayload {
  serviceName: string;
  staffName: string;
  price: string;
}

interface BookingCreatedPayload {
  items?: BookingCreatedItemPayload[];
  serviceName?: string;
  staffName?: string;
  startTime: string;
  endTime: string;
  price?: string;
  totalPrice?: string;
  currency: string;
  source?: string;
  executionMode?: string;
  bundleTitle?: string;
}

interface BookingUpdatedPayload {
  changes: AuditFieldChange[];
  currency?: string;
}

interface BookingCancelledPayload {
  cancelledBy: string;
  reason?: string;
}

interface BookingStatusChangedPayload {
  from: string;
  to: string;
  reason?: string;
}

interface BookingDeletedPayload {
  serviceTitles?: string;
}

// ─── Client ─────────────────────────────────────────────────────────────────

interface ClientCreatedPayload {
  fullName: string;
  phone: string;
}

interface ClientUpdatedPayload {
  changes: AuditFieldChange[];
}

interface ClientDeletedPayload {
  fullName: string;
}

// ─── Staff ──────────────────────────────────────────────────────────────────

interface StaffCreatedPayload {
  name: string;
}

interface StaffUpdatedPayload {
  changes: AuditFieldChange[];
}

interface StaffDeletedPayload {
  name: string;
}

interface StaffShiftsUpdatedPayload {
  startDate: string;
  endDate: string;
}

interface StaffBlockCreatedPayload {
  startDateTime: string;
  endDateTime: string;
  title: string | null;
  reason: string | null;
}

// ─── Service ────────────────────────────────────────────────────────────────

interface ServiceCreatedPayload {
  title: string;
  price: string;
  durationMinutes: number;
  currency: string;
  categoryName?: string;
  imageName?: string;
}

interface ServiceCategoryCreatedPayload {
  name: string;
  description?: string;
}

interface ServiceCategoryUpdatedPayload {
  changes: AuditFieldChange[];
}

interface ServiceCategoryDeletedPayload {
  name: string;
}

interface ServiceBundleCreatedPayload {
  title: string;
  pricingMode: string;
  executionMode: string;
  itemTitles: string;
  fixedPrice?: string;
  currency?: string;
}

interface ServiceBundleUpdatedPayload {
  changes: AuditFieldChange[];
  currency?: string;
}

interface ServiceBundleDeletedPayload {
  title: string;
}

interface ServiceUpdatedPayload {
  changes: AuditFieldChange[];
  currency?: string;
}

interface ServiceDeletedPayload {
  title: string;
}

// ─── Business ───────────────────────────────────────────────────────────────

interface BusinessUpdatedPayload {
  changes: AuditFieldChange[];
}

interface StaffCompensationUpdatedPayload {
  effectiveFrom: string;
  serviceCommissionPercent: string | null;
  productCommissionPercent: string | null;
  fixedSalaryAmount: string | null;
  hourlyRate: string | null;
  salaryMode: string;
  currency: string;
}

interface StaffEarningAuditPayload {
  type?: string;
  amount: string;
  currency: string;
  reason?: string;
  bookingId?: string;
  externalId?: string;
  staffId?: string;
}

interface PayrollPeriodAuditPayload {
  startDate?: string;
  endDate?: string;
  staffCount?: number;
}

// ─── Union ───────────────────────────────────────────────────────────────────

export type AuditPayload =
  | BookingCreatedPayload
  | BookingUpdatedPayload
  | BookingCancelledPayload
  | BookingStatusChangedPayload
  | BookingDeletedPayload
  | ClientCreatedPayload
  | ClientUpdatedPayload
  | ClientDeletedPayload
  | StaffCreatedPayload
  | StaffUpdatedPayload
  | StaffDeletedPayload
  | StaffShiftsUpdatedPayload
  | StaffBlockCreatedPayload
  | StaffCompensationUpdatedPayload
  | StaffEarningAuditPayload
  | ServiceCreatedPayload
  | ServiceUpdatedPayload
  | ServiceDeletedPayload
  | ServiceCategoryCreatedPayload
  | ServiceCategoryUpdatedPayload
  | ServiceCategoryDeletedPayload
  | ServiceBundleCreatedPayload
  | ServiceBundleUpdatedPayload
  | ServiceBundleDeletedPayload
  | BusinessUpdatedPayload
  | PayrollPeriodAuditPayload;

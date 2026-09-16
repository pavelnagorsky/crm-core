export interface AuditFieldChange {
  field: string;
  labelRu: string;
  from: string;
  to: string;
}

// ─── Booking ────────────────────────────────────────────────────────────────

export interface BookingCreatedPayload {
  serviceName: string;
  staffName: string;
  startTime: string;
  endTime: string;
  price: string;
}

export interface BookingUpdatedPayload {
  changes: AuditFieldChange[];
}

export interface BookingCancelledPayload {
  cancelledBy: string;
  reason?: string;
}

export interface BookingStatusChangedPayload {
  from: string;
  to: string;
}

export interface BookingDeletedPayload {}

// ─── Client ─────────────────────────────────────────────────────────────────

export interface ClientCreatedPayload {
  fullName: string;
  phone: string;
}

export interface ClientUpdatedPayload {
  changes: AuditFieldChange[];
}

export interface ClientDeletedPayload {
  fullName: string;
}

// ─── Staff ──────────────────────────────────────────────────────────────────

export interface StaffCreatedPayload {
  name: string;
}

export interface StaffUpdatedPayload {
  changes: AuditFieldChange[];
}

export interface StaffDeletedPayload {
  name: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

export interface ServiceCreatedPayload {
  title: string;
  price: string;
  durationMinutes: number;
}

export interface ServiceUpdatedPayload {
  changes: AuditFieldChange[];
}

export interface ServiceDeletedPayload {
  title: string;
}

// ─── Business ───────────────────────────────────────────────────────────────

export interface BusinessUpdatedPayload {
  changes: AuditFieldChange[];
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
  | ServiceCreatedPayload
  | ServiceUpdatedPayload
  | ServiceDeletedPayload
  | BusinessUpdatedPayload;

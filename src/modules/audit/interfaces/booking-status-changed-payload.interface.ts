export interface BookingStatusChangedPayload {
  from: string;
  to: string;
  reason?: string;
}

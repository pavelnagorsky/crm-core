export interface BookingCreationRequest {
  idempotencyKey: string;
  creationRequestHash: string;
}

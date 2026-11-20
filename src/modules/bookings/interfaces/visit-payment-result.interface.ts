/** Response of PUT bookings/:id/payment, beside the booking id. */
export interface VisitPaymentResult {
  orderId: string;
  operationId: string;
}

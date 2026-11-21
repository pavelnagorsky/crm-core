/** A row of the "not specified" query as PostgreSQL returns it. */
export interface NotSpecifiedSqlRow {
  kind: string;
  orderId: string | null;
  bookingId: string | null;
  bookingStatus: string | null;
  at: Date;
  clientName: string | null;
  staffNames: string[];
  amountDue: string;
  draftProductsCount: number;
  totalCount: bigint;
  totalAmount: string;
}

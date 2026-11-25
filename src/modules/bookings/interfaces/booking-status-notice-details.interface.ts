import { Prisma } from '@prisma/client';

/** What the client's status email says beyond the booking itself. */
export interface BookingStatusNoticeDetails {
  cancellationReason?: string | null;
  /** For a move: the start before it. */
  previousStartAt?: Date | null;
  /** For a move: the services total before it; the email shows the new one if it differs. */
  previousServicesTotal?: Prisma.Decimal | null;
}

import { Prisma } from '@prisma/client';

export interface ServicePriceLineRequest {
  serviceId: string;
  /** Assigned staff member; null in a preview without staff. */
  staffId: string | null;
  customPrice: Prisma.Decimal | null;
}

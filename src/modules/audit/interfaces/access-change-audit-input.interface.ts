import { Prisma } from '@prisma/client';

export interface AccessChangeAuditInput {
  id: string;
  brandId: string;
  locationId: string | null;
  actorId: string;
  action: string;
  targetId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
}

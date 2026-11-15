import { BillingActorRole } from '@prisma/client';

export interface BillingActor {
  /** User id; null for SYSTEM and PROVIDER. */
  id: string | null;
  role: BillingActorRole;
}

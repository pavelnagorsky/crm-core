import { BillingActorRole } from '@prisma/client';
import { BillingActor } from '../interfaces/billing-actor.interface.js';

export const BillingActors = {
  owner: (userId: string): BillingActor => ({
    id: userId,
    role: BillingActorRole.OWNER,
  }),
  admin: (userId: string | null): BillingActor => ({
    id: userId,
    role: BillingActorRole.ADMIN,
  }),
  system: (): BillingActor => ({ id: null, role: BillingActorRole.SYSTEM }),
  provider: (): BillingActor => ({ id: null, role: BillingActorRole.PROVIDER }),
};

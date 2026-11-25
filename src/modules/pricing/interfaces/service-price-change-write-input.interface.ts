import { Prisma, ServicePriceChangeSource } from '@prisma/client';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { ServicePriceChangeItemDraft } from './service-price-change-item-draft.interface.js';

export interface ServicePriceChangeWriteInput {
  locationId: string;
  source: ServicePriceChangeSource;
  /** Local date YYYY-MM-DD after today; null: apply now. */
  effectiveDate: string | null;
  /** RULE: { mode, value, priceRoundingStep, include } as sent; IMPORT: null. */
  ruleSpec: Prisma.InputJsonValue | null;
  fileName: string | null;
  createdServicesCount: number;
  items: ServicePriceChangeItemDraft[];
  actor: AuditActor;
  now: Date;
}

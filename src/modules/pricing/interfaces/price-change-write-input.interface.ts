import { Prisma, PriceChangeCatalog, PriceChangeSource } from '@prisma/client';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { PriceChangeItemDraft } from './price-change-item-draft.interface.js';

export interface PriceChangeWriteInput {
  locationId: string;
  catalog: PriceChangeCatalog;
  source: PriceChangeSource;
  /** Local date YYYY-MM-DD after today; null: apply now. */
  effectiveDate: string | null;
  /** RULE: { mode, value, priceRoundingStep[, include] } as sent; IMPORT: null. */
  ruleSpec: Prisma.InputJsonValue | null;
  fileName: string | null;
  createdServicesCount: number;
  items: PriceChangeItemDraft[];
  /** PRODUCT rows: Product.id by ProductLocation.id, for the date conflict payload. */
  productIds?: ReadonlyMap<string, string>;
  actor: AuditActor;
  now: Date;
}

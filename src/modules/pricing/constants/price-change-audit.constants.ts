import { PriceChangeCatalog } from '@prisma/client';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { PriceChangeAuditEvents } from '../interfaces/price-change-audit-events.interface.js';

/** Audit entity and events of the price changes of each catalog. */
export const PRICE_CHANGE_AUDIT: Record<PriceChangeCatalog, PriceChangeAuditEvents> = {
  [PriceChangeCatalog.SERVICES]: {
    entity: AuditEntity.SERVICE_PRICE_CHANGE,
    created: AuditEvent.SERVICE_PRICE_CHANGE_CREATED,
    imported: AuditEvent.SERVICE_PRICES_IMPORTED,
    applied: AuditEvent.SERVICE_PRICE_CHANGE_APPLIED,
    cancelled: AuditEvent.SERVICE_PRICE_CHANGE_CANCELLED,
    rolledBack: AuditEvent.SERVICE_PRICE_CHANGE_ROLLED_BACK,
  },
  [PriceChangeCatalog.PRODUCTS]: {
    entity: AuditEntity.PRODUCT_PRICE_CHANGE,
    created: AuditEvent.PRODUCT_PRICE_CHANGE_CREATED,
    imported: AuditEvent.PRODUCT_PRICES_IMPORTED,
    applied: AuditEvent.PRODUCT_PRICE_CHANGE_APPLIED,
    cancelled: AuditEvent.PRODUCT_PRICE_CHANGE_CANCELLED,
    rolledBack: AuditEvent.PRODUCT_PRICE_CHANGE_ROLLED_BACK,
  },
};

import { ServicePriceImportFileReason } from '../enums/service-price-import-file-reason.enum.js';
import { ProductPriceSheet } from './product-price-sheet.interface.js';

export type ProductPriceSheetReadResult =
  | { ok: true; sheet: ProductPriceSheet }
  | { ok: false; reason: ServicePriceImportFileReason; columns?: string[] };

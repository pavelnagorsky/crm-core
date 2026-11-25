import { ServicePriceImportFileReason } from '../enums/service-price-import-file-reason.enum.js';
import { ServicePriceImportSheet } from '../enums/service-price-import-sheet.enum.js';
import { ServicePriceBook } from './service-price-book.interface.js';

export type ServicePriceSheetReadResult =
  | { ok: true; book: ServicePriceBook }
  | {
      ok: false;
      reason: ServicePriceImportFileReason;
      sheet?: ServicePriceImportSheet;
      columns?: string[];
    };

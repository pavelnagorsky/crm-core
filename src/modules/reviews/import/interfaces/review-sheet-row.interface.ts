import { ReviewImportRowError } from '../enums/review-import-row-error.enum.js';
import { ReviewSheetRecord } from './review-sheet-record.interface.js';

export type ReviewSheetRow = { number: number } & (
  | { ok: true; record: ReviewSheetRecord }
  | { ok: false; error: ReviewImportRowError }
);

import { ClientImportFileReason } from '../enums/client-import-file-reason.enum.js';
import { ClientSheetColumn } from '../enums/client-sheet-column.enum.js';
import { ClientImportRow } from './client-import-row.interface.js';

export type ClientSheetReadResult =
  | { ok: true; rows: ClientImportRow[]; invalidCount: number; duplicateCount: number }
  | { ok: false; reason: ClientImportFileReason; missingColumns?: ClientSheetColumn[] };

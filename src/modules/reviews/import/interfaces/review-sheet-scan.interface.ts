import { ReviewImportFileReason } from '../enums/review-import-file-reason.enum.js';
import { ReviewSheetColumn } from '../enums/review-sheet-column.enum.js';
import { ReviewImportUpload } from './review-import-upload.interface.js';

export type ReviewSheetScan =
  | {
      ok: true;
      file: ReviewImportUpload;
      headerRow: number;
      columns: Partial<Record<ReviewSheetColumn, number>>;
      /** Non-empty rows below the header. */
      totalRows: number;
    }
  | {
      ok: false;
      reason: ReviewImportFileReason;
      missingColumns?: ReviewSheetColumn[];
    };

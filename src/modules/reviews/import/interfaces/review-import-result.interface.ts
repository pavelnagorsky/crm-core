import { ReviewImportRowError } from '../enums/review-import-row-error.enum.js';
import { ReviewImportRowFailure } from './review-import-row-failure.interface.js';

export interface ReviewImportResult {
  totalRows: number;
  importedCount: number;
  /** Valid rows already in the location or repeated in the file. */
  duplicateCount: number;
  errorCount: number;
  /** Staff names that matched no active staff member or more than one. */
  unmatchedStaffCount: number;
  /** Distinct unmatched names as written in the file, see `REVIEW_IMPORT_MAX_LISTED_STAFF_NAMES`. */
  unmatchedStaffNames: string[];
  errorsByCode: Partial<Record<ReviewImportRowError, number>>;
  /** The first rejected rows, see `REVIEW_IMPORT_MAX_LISTED_ERRORS`. */
  errors: ReviewImportRowFailure[];
}

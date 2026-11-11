import { ReviewImportRowError } from '../enums/review-import-row-error.enum.js';

export interface ReviewImportRowFailure {
  /** Row number in the sheet, as Excel shows it. */
  row: number;
  code: ReviewImportRowError;
}

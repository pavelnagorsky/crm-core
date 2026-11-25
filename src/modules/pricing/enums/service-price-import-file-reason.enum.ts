/** Why the whole price file is rejected, before any row is looked at. */
export enum ServicePriceImportFileReason {
  MISSING = 'MISSING',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
  CORRUPT = 'CORRUPT',
  MISSING_COLUMNS = 'MISSING_COLUMNS',
  EMPTY = 'EMPTY',
  TOO_MANY_ROWS = 'TOO_MANY_ROWS',
}

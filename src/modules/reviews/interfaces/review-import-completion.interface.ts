export interface ReviewImportCompletion {
  batchId: string;
  fileName: string;
  totalRows: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
}

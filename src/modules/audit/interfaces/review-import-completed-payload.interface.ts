export interface ReviewImportCompletedPayload {
  fileName: string;
  totalRows: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
}

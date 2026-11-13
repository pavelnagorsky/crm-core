/** An object written to a bucket; the caller owns the database record. */
export interface StoredFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

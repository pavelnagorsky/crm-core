/** A file written to the private bucket; the caller owns the database record. */
export interface StoredPrivateFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

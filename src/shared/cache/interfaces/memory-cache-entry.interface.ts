export interface MemoryCacheEntry {
  revision: number;
  dependencies: readonly string[];
  payload: string;
  expiresAt: number;
}

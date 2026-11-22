/** How fresh data a read needs: shown values may come from the cache, values a write fixes may not. */
export enum ReadConsistency {
  /** Through the cache: catalog pages, slots, previews. */
  CACHED = 'CACHED',
  /** Straight from the database: the moment a write fixes the value, such as a booking price. */
  FRESH = 'FRESH',
}

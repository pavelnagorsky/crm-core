/** Attempts of one key in `MemorySlidingWindowStore`. */
export interface SlidingWindow {
  /** Attempt times in ms, oldest first. */
  attempts: number[];
  windowMs: number;
}

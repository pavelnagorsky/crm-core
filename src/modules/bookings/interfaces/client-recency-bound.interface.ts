import { ClientRecencyBucket } from '../enums/client-recency-bucket.enum.js';

export interface ClientRecencyBound {
  bucket: ClientRecencyBucket;
  /** Inclusive lower age in calendar days. */
  minDays: number;
  /** Exclusive upper age in calendar days. Null means no upper bound. */
  maxDays: number | null;
}

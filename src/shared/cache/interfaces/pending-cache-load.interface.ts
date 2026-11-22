/** A load in this process; requests join it only when `revision` is not older than their own read. */
export interface PendingCacheLoad {
  revision: number;
  promise: Promise<unknown>;
}

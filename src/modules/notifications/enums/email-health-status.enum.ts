export enum EmailHealthStatus {
  /** The latest attempts succeed. */
  OK = 'OK',
  /** Some recent attempts failed, the latest went through. */
  DEGRADED = 'DEGRADED',
  /** The latest attempts all failed, or the queue is not running. */
  DOWN = 'DOWN',
  /** Nothing was sent recently: no evidence either way. */
  IDLE = 'IDLE',
}

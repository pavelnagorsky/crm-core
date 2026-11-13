export enum ThrottlerName {
  /** Per-IP flood cap shared by every endpoint. */
  BURST = 'burst',
  /** Per-IP, per-endpoint limit; tightened on sensitive routes via decorators. */
  SUSTAINED = 'sustained',
}

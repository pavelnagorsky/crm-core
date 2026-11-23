/** What a process runs (`APP_ROLE`). Every role serves HTTP; only crons depend on the role. */
export enum AppRole {
  /** HTTP and crons: local `start:dev` and single-process deployments. */
  ALL = 'all',
  /** HTTP only, no crons. */
  API = 'api',
  /** Crons (the load balancer sends it no traffic; HTTP stays up for `/health`). */
  WORKER = 'worker',
}

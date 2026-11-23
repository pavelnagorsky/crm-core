import { StateBackend } from '../shared/enums/state-backend.enum.js';

/**
 * Redis when `REDIS_URL` is set, otherwise process memory. Production always has Redis (`redisUrl` requires it),
 * so a deployment never falls back to memory by accident.
 */
export function stateBackend(redisUrl: string | undefined): StateBackend {
  return redisUrl ? StateBackend.REDIS : StateBackend.MEMORY;
}

import { AppRole } from '../shared/enums/app-role.enum.js';

const ROLES = Object.values(AppRole) as string[];

/** `APP_ROLE`, `all` when missing. An unknown value fails startup instead of silently running crons or not. */
export function appRole(env: NodeJS.ProcessEnv = process.env): AppRole {
  const value = env['APP_ROLE']?.trim().toLowerCase();
  if (!value) return AppRole.ALL;
  if (!ROLES.includes(value))
    throw new Error(
      `APP_ROLE must be one of ${ROLES.join(', ')}, got "${env['APP_ROLE']}"`,
    );
  return value as AppRole;
}

/**
 * Background work (crons, job queue workers, queue metrics) runs only in `worker` and `all`; `api` processes
 * serve HTTP and only put jobs into the queue.
 */
export function runsBackgroundWork(role: AppRole): boolean {
  return role !== AppRole.API;
}

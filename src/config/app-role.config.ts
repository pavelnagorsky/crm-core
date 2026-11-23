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

/** Crons are scheduled only by `worker` and `all`; `api` processes never run them. */
export function runsCrons(role: AppRole): boolean {
  return role !== AppRole.API;
}

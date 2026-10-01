const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Refresh token lifetime in days. Single source of truth shared by the signed
 * JWT (expiresIn), the stored refreshToken.expiryDate, and the cookie maxAge.
 */
export const REFRESH_TOKEN_TTL_DAYS = 30;

/** Refresh token lifetime in milliseconds — used for the cookie maxAge. */
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * DAY_MS;

/**
 * JWT `expiresIn` durations. Secrets remain in env; lifetimes live in code.
 * Values use the `ms`/jsonwebtoken duration syntax.
 */
export const jwtExpirationConfig = {
  accessToken: '2h',
  emailToken: '5d',
  refreshToken: `${REFRESH_TOKEN_TTL_DAYS}d`,
  bookingClientToken: '24h',
} as const;

/** How long a password-reset code stays valid after it is issued. */
export const RESET_CODE_TTL_MINUTES = 15;

/** Minimum interval between two password-reset code requests for one user. */
export const RESET_CODE_RESEND_COOLDOWN_SECONDS = 60;

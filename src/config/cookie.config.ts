import { CookieOptions } from 'express';
import { REFRESH_TOKEN_TTL_MS } from './token-expiration.config.js';

export const cookieConfig: CookieOptions = {
  httpOnly: true,
  maxAge: REFRESH_TOKEN_TTL_MS,
  sameSite: 'none',
  secure: true,
};

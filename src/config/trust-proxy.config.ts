const DEFAULT_TRUST_PROXY = 'loopback, linklocal, uniquelocal';

/**
 * Express `trust proxy` value. Numeric strings are hop counts; anything else is
 * a comma-separated list of trusted proxy addresses/subnets.
 */
export function trustProxy(raw = process.env.TRUST_PROXY): number | string {
  const value = raw?.trim() || DEFAULT_TRUST_PROXY;
  return /^\d+$/.test(value) ? Number(value) : value;
}

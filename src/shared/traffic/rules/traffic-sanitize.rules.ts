import regularExpressions from '../../regular-expressions.js';
import {
  REFERRER_HOST_MAX_LENGTH,
  TOUCH_MAX_AGE_MS,
  TOUCH_MAX_FUTURE_MS,
  TRAFFIC_DETAIL_MAX_LENGTH,
} from '../constants/traffic-limits.constants.js';

/**
 * A client-sent traffic value as stored: a string without control characters, trimmed and cut
 * to maxLength. Anything else, or nothing left, is undefined. Never throws.
 */
export function sanitizeTrafficValue(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value
    .replace(regularExpressions.controlChars, '')
    .trim()
    .slice(0, maxLength)
    .trim();
  return clean || undefined;
}

/** A UTM value; one that holds an email or a phone-like digit run is personal data and is dropped. */
export function sanitizeUtmValue(
  value: unknown,
  maxLength: number,
): string | undefined {
  const clean = sanitizeTrafficValue(value, maxLength);
  if (!clean) return undefined;
  if (
    regularExpressions.emailLike.test(clean) ||
    regularExpressions.longDigitRun.test(clean)
  )
    return undefined;
  return clean;
}

/** The moment of the touch; one older than the attribution window or in the future is dropped. */
export function sanitizeTouchedAt(
  value: unknown,
  now = new Date(),
): Date | undefined {
  const raw =
    typeof value === 'string'
      ? sanitizeTrafficValue(value, 64)
      : value instanceof Date
        ? value
        : undefined;
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  const time = date.getTime();
  if (Number.isNaN(time)) return undefined;
  if (time < now.getTime() - TOUCH_MAX_AGE_MS) return undefined;
  if (time > now.getTime() + TOUCH_MAX_FUTURE_MS) return undefined;
  return date;
}

/** A utm_source or utm_medium as matched against the alias lists: lowercase, spaces as "_". */
export function normalizeTrafficToken(
  value: string | null | undefined,
): string | undefined {
  const token = value
    ?.trim()
    .toLowerCase()
    .replace(regularExpressions.whitespaceRun, '_');
  return token || undefined;
}

/** A source detail as stored and grouped: lowercase, unsafe runs as "_", at most 64. */
export function normalizeTrafficDetail(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const detail = value
    .toLowerCase()
    .replace(regularExpressions.trafficDetailUnsafe, '_')
    .replace(regularExpressions.underscoreRun, '_')
    .replace(regularExpressions.edgeUnderscores, '')
    .slice(0, TRAFFIC_DETAIL_MAX_LENGTH)
    .replace(regularExpressions.edgeUnderscores, '');
  return detail || null;
}

/**
 * The host of a referrer, a bare host or a full URL: lowercase ASCII (IDN as punycode), without
 * port, trailing dot and a leading www. or m. Null unless it is a valid hostname or IPv4.
 */
export function normalizeReferrerHost(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(
      regularExpressions.urlScheme.test(raw) ? raw : `http://${raw}`,
    );
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const hostname = url.hostname;
  let host = hostname
    .toLowerCase()
    .replace(regularExpressions.trailingDots, '');
  const stripped = host.replace(regularExpressions.referrerHostPrefix, '');
  if (stripped !== host && stripped.includes('.')) host = stripped;
  if (!host || host.length > REFERRER_HOST_MAX_LENGTH) return null;
  if (
    !regularExpressions.hostname.test(host) &&
    !regularExpressions.ipv4.test(host)
  )
    return null;
  return host;
}

/** Whether a host is one of ours or a subdomain of one: a visit from our own pages is not a source. */
export function isOwnHost(host: string, ownHosts: readonly string[]): boolean {
  return ownHosts.some((own) => isDomainOrSubdomain(host, own));
}

/** Whether host is domain itself or a subdomain of it. */
export function isDomainOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

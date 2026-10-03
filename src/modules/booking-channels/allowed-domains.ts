import regularExpressions from '../../shared/regular-expressions.js';

const MAX_DOMAINS = 20;

export function normalizeAllowedDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value || /\s/.test(value)) return null;

  if (/^[a-z][a-z0-9+.-]*:\/\//.test(value) || value.startsWith('//')) {
    const withProtocol = value.startsWith('//') ? `http:${value}` : value;
    try {
      value = new URL(withProtocol).hostname;
    } catch {
      return null;
    }
  } else {
    value = value.split(/[/?#]/)[0] ?? '';
    const at = value.lastIndexOf('@');
    if (at >= 0) value = value.slice(at + 1);
    if (value.startsWith('[')) return null;
    const colon = value.lastIndexOf(':');
    if (colon > 0 && isDigits(value.slice(colon + 1))) value = value.slice(0, colon);
  }

  if (value.startsWith('www.')) value = value.slice(4);
  if (value.endsWith('.')) value = value.slice(0, -1);
  if (regularExpressions.hostname.test(value) || regularExpressions.ipv4.test(value)) return value;
  return null;
}

export function normalizeAllowedDomains(values: string[]): string[] | null {
  if (values.length > MAX_DOMAINS) return null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const host = normalizeAllowedDomain(value);
    if (!host) return null;
    if (seen.has(host)) continue;
    seen.add(host);
    result.push(host);
  }
  return result;
}

export function isDomainAllowed(allowed: string[], origin: string | undefined): boolean {
  if (allowed.length === 0) return true;
  const host = hostFromRequestOrigin(origin);
  if (!host) return false;
  return allowed.includes(host);
}

function hostFromRequestOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return normalizeAllowedDomain(new URL(origin).hostname);
  } catch {
    return null;
  }
}

function isDigits(value: string): boolean {
  if (!value) return false;
  for (const char of value) {
    if (char < '0' || char > '9') return false;
  }
  return true;
}
